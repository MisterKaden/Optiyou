import AVFoundation
import AudioToolbox
import SwiftUI
import Vision
import VisionKit

struct ScannerView: View {
    @EnvironmentObject private var store: AppStore
    var openSheet: (AppSheet) -> Void
    var openProduct: (Product, ScanSource) -> Void

    @State private var sessionState: ScanSessionState = .idle
    @State private var debouncer = BarcodeScanDebouncer()
    @State private var isTorchOn = false
    @State private var isSoundOn = true
    @State private var showsManualSearch = false
    @State private var contributionDraft: ContributionDraft?
    @State private var cameraAuthorization = AVCaptureDevice.authorizationStatus(for: .video)

    private var scannerAvailable: Bool {
        DataScannerViewController.isSupported &&
            cameraAuthorization != .denied &&
            cameraAuthorization != .restricted &&
            (cameraAuthorization != .authorized || DataScannerViewController.isAvailable)
    }

    var body: some View {
        ZStack {
            scannerSurface
                .ignoresSafeArea()

            scannerOverlay
        }
        .background(Color.black.ignoresSafeArea())
        .navigationTitle("Scan")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .navigationBar)
        .onAppear {
            requestCameraAccessIfNeeded()
            sessionState = scannerAvailable ? .scanning : .unavailable(unavailableScannerMessage)
        }
        .sheet(isPresented: $showsManualSearch) {
            NavigationStack {
                SearchView(openSheet: openSheet) { product in
                    showsManualSearch = false
                    openProduct(product, .manualSearch)
                }
            }
        }
        .sheet(item: $contributionDraft) { draft in
            ContributionDraftSheet(draft: draft)
        }
    }

    @ViewBuilder
    private var scannerSurface: some View {
        if scannerAvailable {
            BarcodeDataScannerView(isScanning: sessionState.isActivelyScanning) { rawBarcode in
                handleDetectedBarcode(rawBarcode)
            }
        } else {
            LinearGradient(
                colors: [Color.black, Color.optiInk, Color.black],
                startPoint: .top,
                endPoint: .bottom
            )
        }
    }

    private var scannerOverlay: some View {
        VStack {
            HStack {
                controlButton(systemImage: isTorchOn ? "flashlight.on.fill" : "flashlight.off.fill") {
                    toggleTorch()
                }
                Spacer()
                controlButton(systemImage: isSoundOn ? "speaker.wave.2.fill" : "speaker.slash.fill") {
                    isSoundOn.toggle()
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 44)

            Spacer()

            VStack(spacing: 18) {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color.white, lineWidth: 3)
                    .frame(height: 210)
                    .padding(.horizontal, 38)
                VStack(spacing: 8) {
                    Text(sessionState.title)
                        .font(.headline.weight(.black))
                    Text(sessionState.detail)
                        .font(.caption.weight(.semibold))
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white.opacity(0.72))
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 72)
            }

            Spacer()

            fallbackBar
        }
    }

    private var fallbackBar: some View {
        VStack(spacing: 10) {
            HStack(spacing: 10) {
                fallbackButton("Search", systemImage: "magnifyingglass") {
                    showsManualSearch = true
                }
                fallbackButton("Nutrition", systemImage: "tablecells") {
                    openProduct(SampleCatalog.products[4], .nutritionPhoto)
                }
                fallbackButton("Ingredients", systemImage: "text.viewfinder") {
                    openProduct(SampleCatalog.products[3], .ingredientsPhoto)
                }
            }

            Button {
                openSheet(.contribute)
            } label: {
                Label("No barcode? Contribute label photos", systemImage: "camera.viewfinder")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .tint(.white)
        }
        .padding(16)
        .background(.black.opacity(0.72))
    }

    private func controlButton(systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.title2.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(.black.opacity(0.5))
                .clipShape(Circle())
        }
    }

    private func fallbackButton(_ title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 5) {
                Image(systemName: systemImage)
                    .font(.headline.weight(.bold))
                Text(title)
                    .font(.caption.weight(.black))
            }
            .frame(maxWidth: .infinity)
            .frame(height: 58)
        }
        .buttonStyle(.borderedProminent)
        .tint(Color.optiGreen)
    }

    private func handleDetectedBarcode(_ rawBarcode: String) {
        guard case .scanning = sessionState,
              let result = debouncer.shouldAccept(rawValue: rawBarcode) else {
            return
        }

        if isSoundOn {
            AudioServicesPlaySystemSound(1108)
        }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        Task {
            await processScan(result)
        }
    }

    private func processScan(_ result: BarcodeScanResult) async {
        sessionState = .processing(result.normalizedGTIN)
        let outcome = await store.scanBarcode(result.normalizedGTIN)

        switch outcome {
        case let .product(product):
            sessionState = .productFound(result.normalizedGTIN)
            openProduct(product, .barcode)
        case let .contribution(draft):
            sessionState = .unknownProduct(result.normalizedGTIN)
            contributionDraft = draft
        }

        try? await Task.sleep(for: .seconds(1.2))
        if case .productFound = sessionState {
            sessionState = .scanning
        }
    }

    private func toggleTorch() {
        guard let device = AVCaptureDevice.default(for: .video), device.hasTorch else {
            return
        }

        do {
            try device.lockForConfiguration()
            if isTorchOn {
                device.torchMode = .off
            } else {
                try device.setTorchModeOn(level: AVCaptureDevice.maxAvailableTorchLevel)
            }
            device.unlockForConfiguration()
            isTorchOn.toggle()
        } catch {
            sessionState = .failed("Flashlight is not available right now.")
        }
    }

    private func requestCameraAccessIfNeeded() {
        guard DataScannerViewController.isSupported, cameraAuthorization == .notDetermined else {
            return
        }

        AVCaptureDevice.requestAccess(for: .video) { granted in
            Task { @MainActor in
                cameraAuthorization = AVCaptureDevice.authorizationStatus(for: .video)
                sessionState = granted && DataScannerViewController.isSupported ? .scanning : .unavailable(unavailableScannerMessage)
            }
        }
    }

    private var unavailableScannerMessage: String {
        if DataScannerViewController.isSupported == false {
            return "This device does not support live data scanning. Use search or label-photo contribution."
        }
        return "Camera permission is blocked or restricted. Enable camera access, or use search and label-photo contribution."
    }
}

private struct BarcodeDataScannerView: UIViewControllerRepresentable {
    var isScanning: Bool
    var onBarcode: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean8, .ean13, .upce])],
            qualityLevel: .fast,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: true,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        if isScanning, scanner.isScanning == false {
            try? scanner.startScanning()
        } else if isScanning == false, scanner.isScanning {
            scanner.stopScanning()
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onBarcode: onBarcode)
    }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        var onBarcode: (String) -> Void

        init(onBarcode: @escaping (String) -> Void) {
            self.onBarcode = onBarcode
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didAdd addedItems: [RecognizedItem],
            allItems: [RecognizedItem]
        ) {
            handle(items: addedItems)
        }

        func dataScanner(
            _ dataScanner: DataScannerViewController,
            didTapOn item: RecognizedItem
        ) {
            handle(items: [item])
        }

        private func handle(items: [RecognizedItem]) {
            for item in items {
                if case let .barcode(barcode) = item,
                   let value = barcode.payloadStringValue {
                    onBarcode(value)
                    return
                }
            }
        }
    }
}

private struct ContributionDraftSheet: View {
    @Environment(\.dismiss) private var dismiss
    var draft: ContributionDraft

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                Text("Help Optiyou learn this product")
                    .font(.largeTitle.weight(.black))
                    .foregroundStyle(Color.optiInk)
                Text("Barcode \(draft.gtin) is not in the verified food catalog yet.")
                    .font(.headline)
                    .foregroundStyle(Color.optiMuted)

                SectionCard {
                    VStack(alignment: .leading, spacing: 14) {
                        StatusBadge(title: draft.confidenceLabel, systemImage: "scope", color: .optiAmber)
                        ForEach(draft.requiredPhotos) { photo in
                            Label(photo.title, systemImage: photo.systemImage)
                                .font(.headline.weight(.bold))
                        }
                    }
                }

                Text("AI can extract the label, but Optiyou marks the result as estimated until data quality improves.")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.optiMuted)

                Spacer()
            }
            .padding(16)
            .background(Color.optiBackground.ignoresSafeArea())
            .navigationTitle("Contribution")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
    }
}
