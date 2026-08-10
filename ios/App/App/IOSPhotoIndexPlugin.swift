import Capacitor
import Foundation
import Photos
import PhotosUI
import QuartzCore
import UIKit
import UniformTypeIdentifiers

@objc(IOSPhotoIndexPlugin)
public final class IOSPhotoIndexPlugin: CAPPlugin,
    CAPBridgedPlugin,
    PHPickerViewControllerDelegate,
    UIDocumentPickerDelegate {

    public let identifier = "IOSPhotoIndexPlugin"
    public let jsName = "IOSPhotoIndex"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(
            name: "pickPhotos",
            returnType: CAPPluginReturnPromise
        ),
        CAPPluginMethod(
            name: "presentPhoto",
            returnType: CAPPluginReturnPromise
        ),
        CAPPluginMethod(
            name: "exportRecordFile",
            returnType: CAPPluginReturnPromise
        ),
        CAPPluginMethod(
            name: "pickRecordFile",
            returnType: CAPPluginReturnPromise
        )
    ]

    private var pendingPickerCall: CAPPluginCall?
    private var pendingRecordImportCall: CAPPluginCall?
    private var pendingRecordExportCall: CAPPluginCall?
    private var pendingRecordExportURL: URL?

    @objc public func pickPhotos(_ call: CAPPluginCall) {
        guard pendingPickerCall == nil else {
            call.reject("照片选择器已经打开。")
            return
        }

        requestPhotoLibraryAccess { [weak self] granted in
            guard let self else { return }

            guard granted else {
                DispatchQueue.main.async {
                    call.reject(
                        "需要允许雪粒读取所选照片，才能保存照片索引并再次打开原图。"
                    )
                }
                return
            }

            DispatchQueue.main.async {
                guard let presenter = self.bridge?.viewController else {
                    call.reject("找不到雪粒主页面。")
                    return
                }

                var configuration = PHPickerConfiguration(
                    photoLibrary: PHPhotoLibrary.shared()
                )
                configuration.filter = .images
                configuration.selectionLimit = 0
                configuration.preferredAssetRepresentationMode = .current

                let picker = PHPickerViewController(
                    configuration: configuration
                )
                picker.delegate = self
                picker.modalPresentationStyle = .fullScreen

                self.pendingPickerCall = call
                presenter.present(picker, animated: true)
            }
        }
    }

    public func picker(
        _ picker: PHPickerViewController,
        didFinishPicking results: [PHPickerResult]
    ) {
        let call = pendingPickerCall
        pendingPickerCall = nil

        picker.dismiss(animated: true) {
            guard let call else { return }

            let identifiers = results.compactMap(\.assetIdentifier)
            guard !identifiers.isEmpty else {
                if results.isEmpty {
                    call.resolve([
                        "photos": [],
                        "cancelled": true
                    ])
                } else {
                    call.reject(
                        "没有取得照片索引。请在系统设置中允许雪粒访问所选照片。"
                    )
                }
                return
            }

            self.makePhotoPayloads(
                identifiers: identifiers
            ) { payloads in
                call.resolve([
                    "photos": payloads,
                    "cancelled": false
                ])
            }
        }
    }

    @objc public func exportRecordFile(_ call: CAPPluginCall) {
        guard pendingRecordExportCall == nil,
              pendingRecordImportCall == nil else {
            call.reject("记录文件选择器已经打开。")
            return
        }

        let content = call.getString("content") ?? ""
        var fileName = call.getString("fileName") ?? "雪粒记录.json"

        fileName = fileName
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "\\", with: "_")

        guard let data = content.data(using: .utf8) else {
            call.reject("记录文件内容无法转换。")
            return
        }

        let fileURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(fileName)

        do {
            try data.write(to: fileURL, options: .atomic)
        } catch {
            call.reject("记录文件没有生成成功。", nil, error)
            return
        }

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                try? FileManager.default.removeItem(at: fileURL)
                call.reject("找不到雪粒主页面。")
                return
            }

            // iOS 备份文件直接交给系统“文件”保存器。
            // 这样导出的 JSON 是长期可见文件，不再只存在于临时分享目录。
            let picker = UIDocumentPickerViewController(
                forExporting: [fileURL],
                asCopy: true
            )
            picker.delegate = self
            picker.modalPresentationStyle = .formSheet

            self.pendingRecordExportCall = call
            self.pendingRecordExportURL = fileURL
            presenter.present(picker, animated: true)
        }
    }

    @objc public func pickRecordFile(_ call: CAPPluginCall) {
        guard pendingRecordImportCall == nil,
              pendingRecordExportCall == nil else {
            call.reject("记录文件选择器已经打开。")
            return
        }

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("找不到雪粒主页面。")
                return
            }

            let picker = UIDocumentPickerViewController(
                forOpeningContentTypes: [.json],
                asCopy: true
            )
            picker.delegate = self
            picker.allowsMultipleSelection = false
            picker.modalPresentationStyle = .formSheet

            self.pendingRecordImportCall = call
            presenter.present(picker, animated: true)
        }
    }

    public func documentPicker(
        _ controller: UIDocumentPickerViewController,
        didPickDocumentsAt urls: [URL]
    ) {
        if let exportCall = pendingRecordExportCall {
            pendingRecordExportCall = nil
            cleanupPendingRecordExportFile()
            exportCall.resolve([
                "cancelled": false,
                "saved": true
            ])
            return
        }

        guard let importCall = pendingRecordImportCall else { return }
        pendingRecordImportCall = nil

        guard let fileURL = urls.first else {
            importCall.resolve(["cancelled": true])
            return
        }

        let didAccess = fileURL.startAccessingSecurityScopedResource()
        defer {
            if didAccess {
                fileURL.stopAccessingSecurityScopedResource()
            }
        }

        do {
            let data = try Data(contentsOf: fileURL)
            guard let content = String(data: data, encoding: .utf8) else {
                importCall.reject("记录文件不是 UTF-8 文本，无法读取。")
                return
            }

            importCall.resolve([
                "cancelled": false,
                "fileName": fileURL.lastPathComponent,
                "content": content
            ])
        } catch {
            importCall.reject("记录文件无法读取。", nil, error)
        }
    }

    public func documentPickerWasCancelled(
        _ controller: UIDocumentPickerViewController
    ) {
        if let exportCall = pendingRecordExportCall {
            pendingRecordExportCall = nil
            cleanupPendingRecordExportFile()
            exportCall.resolve([
                "cancelled": true,
                "saved": false
            ])
            return
        }

        if let importCall = pendingRecordImportCall {
            pendingRecordImportCall = nil
            importCall.resolve(["cancelled": true])
        }
    }

    private func cleanupPendingRecordExportFile() {
        if let url = pendingRecordExportURL {
            try? FileManager.default.removeItem(at: url)
        }
        pendingRecordExportURL = nil
    }

    @objc public func presentPhoto(_ call: CAPPluginCall) {
        let requestedIdentifier =
            call.getString("assetIdentifier") ?? ""

        var identifiers =
            call.getArray("assetIdentifiers")?
                .compactMap { $0 as? String }
                .filter { !$0.isEmpty }
            ?? []

        if identifiers.isEmpty && !requestedIdentifier.isEmpty {
            identifiers = [requestedIdentifier]
        }

        guard !identifiers.isEmpty else {
            call.reject("缺少照片索引。")
            return
        }

        let requestedIndex = call.getInt("currentIndex") ?? 0

        requestPhotoLibraryAccess { [weak self] granted in
            guard let self else { return }

            guard granted else {
                DispatchQueue.main.async {
                    call.reject("雪粒没有读取这些原图的权限。")
                }
                return
            }

            var assets: [PHAsset] = []
            var availableIdentifiers: [String] = []

            for identifier in identifiers {
                let fetched = PHAsset.fetchAssets(
                    withLocalIdentifiers: [identifier],
                    options: nil
                )

                if let asset = fetched.firstObject {
                    assets.append(asset)
                    availableIdentifiers.append(identifier)
                }
            }

            guard !assets.isEmpty else {
                DispatchQueue.main.async {
                    call.reject(
                        "这些原照片已不在系统相册中，或访问权限已被取消。"
                    )
                }
                return
            }

            var initialIndex = max(
                0,
                min(requestedIndex, assets.count - 1)
            )

            if !requestedIdentifier.isEmpty,
               let exactIndex = availableIdentifiers.firstIndex(
                   of: requestedIdentifier
               ) {
                initialIndex = exactIndex
            }

            DispatchQueue.main.async {
                guard let presenter = self.bridge?.viewController else {
                    call.reject("找不到雪粒主页面。")
                    return
                }

                let viewer = SnowballIndexedPhotoViewController(
                    assets: assets,
                    initialIndex: initialIndex
                )
                viewer.modalPresentationStyle = .fullScreen

                presenter.present(viewer, animated: true) {
                    call.resolve([
                        "opened": true,
                        "assetIdentifier":
                            availableIdentifiers[initialIndex],
                        "count": assets.count,
                        "currentIndex": initialIndex
                    ])
                }
            }
        }
    }

    private func requestPhotoLibraryAccess(
        completion: @escaping (Bool) -> Void
    ) {
        let current = PHPhotoLibrary.authorizationStatus(
            for: .readWrite
        )

        switch current {
        case .authorized, .limited:
            completion(true)

        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(
                for: .readWrite
            ) { status in
                completion(
                    status == .authorized || status == .limited
                )
            }

        default:
            completion(false)
        }
    }

    private func makePhotoPayloads(
        identifiers: [String],
        completion: @escaping ([[String: Any]]) -> Void
    ) {
        let group = DispatchGroup()
        let lock = NSLock()
        var payloads = Array<[String: Any]?>(repeating: nil, count: identifiers.count)
        let manager = PHImageManager.default()

        for (index, identifier) in identifiers.enumerated() {
            let assets = PHAsset.fetchAssets(
                withLocalIdentifiers: [identifier],
                options: nil
            )

            guard let asset = assets.firstObject else {
                continue
            }

            group.enter()

            let options = PHImageRequestOptions()
            options.deliveryMode = .highQualityFormat
            options.resizeMode = .fast
            options.isNetworkAccessAllowed = true

            var completed = false
            manager.requestImage(
                for: asset,
                targetSize: CGSize(width: 240, height: 240),
                contentMode: .aspectFill,
                options: options
            ) { image, info in
                let degraded =
                    (info?[PHImageResultIsDegradedKey] as? Bool) ?? false
                if degraded { return }

                lock.lock()
                defer { lock.unlock() }

                if completed { return }
                completed = true

                defer { group.leave() }

                guard let image,
                      let jpeg = image.jpegData(
                        compressionQuality: 0.55
                      ) else {
                    return
                }

                payloads[index] = [
                    "id": UUID().uuidString,
                    "assetIdentifier": identifier,
                    "thumbnail":
                        "data:image/jpeg;base64,"
                        + jpeg.base64EncodedString(),
                    "width": asset.pixelWidth,
                    "height": asset.pixelHeight,
                    "createdAt":
                        ISO8601DateFormatter().string(from: Date()),
                    "source": "ios-photo-library-index"
                ]
            }
        }

        group.notify(queue: .main) {
            completion(payloads.compactMap { $0 })
        }
    }
}


private final class SnowballIndexedPhotoViewController:
    UIViewController,
    UIScrollViewDelegate,
    UIGestureRecognizerDelegate {

    private let assets: [PHAsset]
    private var currentIndex: Int

    private let scrollView = UIScrollView()
    private let imageView = UIImageView()
    private let spinner = UIActivityIndicatorView(style: .large)
    private let counterLabel = UILabel()

    private var imageRequestID: PHImageRequestID =
        PHInvalidImageRequestID
    private var currentImage: UIImage?

    init(
        assets: [PHAsset],
        initialIndex: Int
    ) {
        self.assets = assets
        self.currentIndex = max(
            0,
            min(initialIndex, max(assets.count - 1, 0))
        )
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        nil
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = .black

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.delegate = self
        scrollView.minimumZoomScale = 1
        scrollView.maximumZoomScale = 5
        scrollView.showsVerticalScrollIndicator = false
        scrollView.showsHorizontalScrollIndicator = false
        scrollView.backgroundColor = .black

        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.contentMode = .scaleAspectFit
        imageView.isUserInteractionEnabled = true

        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.color = .white

        counterLabel.translatesAutoresizingMaskIntoConstraints = false
        counterLabel.textColor = .white
        counterLabel.font = .systemFont(
            ofSize: 14,
            weight: .medium
        )
        counterLabel.textAlignment = .center
        counterLabel.backgroundColor =
            UIColor.black.withAlphaComponent(0.32)
        counterLabel.layer.cornerRadius = 13
        counterLabel.clipsToBounds = true
        counterLabel.isHidden = assets.count <= 1

        let closeButton = UIButton(type: .system)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.setTitle("×", for: .normal)
        closeButton.setTitleColor(.white, for: .normal)
        closeButton.titleLabel?.font = .systemFont(
            ofSize: 34,
            weight: .regular
        )
        closeButton.backgroundColor =
            UIColor.black.withAlphaComponent(0.35)
        closeButton.layer.cornerRadius = 22
        closeButton.addTarget(
            self,
            action: #selector(closeViewer),
            for: .touchUpInside
        )

        let swipeLeft = UISwipeGestureRecognizer(
            target: self,
            action: #selector(handleSwipe(_:))
        )
        swipeLeft.direction = .left
        swipeLeft.delegate = self
        swipeLeft.cancelsTouchesInView = false

        let swipeRight = UISwipeGestureRecognizer(
            target: self,
            action: #selector(handleSwipe(_:))
        )
        swipeRight.direction = .right
        swipeRight.delegate = self
        swipeRight.cancelsTouchesInView = false

        let longPress = UILongPressGestureRecognizer(
            target: self,
            action: #selector(handleLongPress(_:))
        )
        longPress.minimumPressDuration = 0.55
        longPress.delegate = self
        longPress.cancelsTouchesInView = false

        scrollView.addGestureRecognizer(swipeLeft)
        scrollView.addGestureRecognizer(swipeRight)
        imageView.addGestureRecognizer(longPress)

        view.addSubview(scrollView)
        scrollView.addSubview(imageView)
        view.addSubview(spinner)
        view.addSubview(counterLabel)
        view.addSubview(closeButton)

        NSLayoutConstraint.activate([
            scrollView.leadingAnchor.constraint(
                equalTo: view.leadingAnchor
            ),
            scrollView.trailingAnchor.constraint(
                equalTo: view.trailingAnchor
            ),
            scrollView.topAnchor.constraint(
                equalTo: view.topAnchor
            ),
            scrollView.bottomAnchor.constraint(
                equalTo: view.bottomAnchor
            ),

            imageView.leadingAnchor.constraint(
                equalTo: scrollView.contentLayoutGuide.leadingAnchor
            ),
            imageView.trailingAnchor.constraint(
                equalTo: scrollView.contentLayoutGuide.trailingAnchor
            ),
            imageView.topAnchor.constraint(
                equalTo: scrollView.contentLayoutGuide.topAnchor
            ),
            imageView.bottomAnchor.constraint(
                equalTo: scrollView.contentLayoutGuide.bottomAnchor
            ),
            imageView.widthAnchor.constraint(
                equalTo: scrollView.frameLayoutGuide.widthAnchor
            ),
            imageView.heightAnchor.constraint(
                equalTo: scrollView.frameLayoutGuide.heightAnchor
            ),

            spinner.centerXAnchor.constraint(
                equalTo: view.centerXAnchor
            ),
            spinner.centerYAnchor.constraint(
                equalTo: view.centerYAnchor
            ),

            counterLabel.centerXAnchor.constraint(
                equalTo: view.centerXAnchor
            ),
            counterLabel.bottomAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.bottomAnchor,
                constant: -16
            ),
            counterLabel.widthAnchor.constraint(
                greaterThanOrEqualToConstant: 54
            ),
            counterLabel.heightAnchor.constraint(
                equalToConstant: 26
            ),

            closeButton.trailingAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.trailingAnchor,
                constant: -14
            ),
            closeButton.topAnchor.constraint(
                equalTo: view.safeAreaLayoutGuide.topAnchor,
                constant: 10
            ),
            closeButton.widthAnchor.constraint(equalToConstant: 44),
            closeButton.heightAnchor.constraint(equalToConstant: 44)
        ])

        updateCounter()
        loadCurrentPhoto(animatedFrom: nil)
    }

    deinit {
        cancelCurrentRequest()
    }

    func viewForZooming(
        in scrollView: UIScrollView
    ) -> UIView? {
        imageView
    }

    func gestureRecognizerShouldBegin(
        _ gestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        if gestureRecognizer is UISwipeGestureRecognizer {
            return scrollView.zoomScale <= 1.01
        }
        return true
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith
            otherGestureRecognizer: UIGestureRecognizer
    ) -> Bool {
        true
    }

    @objc private func closeViewer() {
        dismiss(animated: true)
    }

    @objc private func handleSwipe(
        _ recognizer: UISwipeGestureRecognizer
    ) {
        guard scrollView.zoomScale <= 1.01 else {
            return
        }

        switch recognizer.direction {
        case .left:
            guard currentIndex < assets.count - 1 else {
                return
            }
            currentIndex += 1
            loadCurrentPhoto(animatedFrom: .fromRight)

        case .right:
            guard currentIndex > 0 else {
                return
            }
            currentIndex -= 1
            loadCurrentPhoto(animatedFrom: .fromLeft)

        default:
            return
        }
    }

    @objc private func handleLongPress(
        _ recognizer: UILongPressGestureRecognizer
    ) {
        guard recognizer.state == .began else {
            return
        }

        UIImpactFeedbackGenerator(
            style: .light
        ).impactOccurred()

        if let currentImage {
            presentShareSheet(image: currentImage)
            return
        }

        requestShareImage()
    }

    private func loadCurrentPhoto(
        animatedFrom direction: CATransitionSubtype?
    ) {
        guard assets.indices.contains(currentIndex) else {
            return
        }

        cancelCurrentRequest()

        currentImage = nil
        imageView.image = nil
        scrollView.setZoomScale(1, animated: false)
        spinner.startAnimating()
        updateCounter()

        if let direction {
            let transition = CATransition()
            transition.type = .push
            transition.subtype = direction
            transition.duration = 0.22
            transition.timingFunction =
                CAMediaTimingFunction(name: .easeInEaseOut)
            imageView.layer.add(
                transition,
                forKey: "snowball-photo-swipe"
            )
        }

        let scale = UIScreen.main.scale
        let target = CGSize(
            width: max(view.bounds.width, 1) * scale * 2,
            height: max(view.bounds.height, 1) * scale * 2
        )

        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .none
        options.isNetworkAccessAllowed = true

        let requestedIndex = currentIndex
        imageRequestID = PHImageManager.default().requestImage(
            for: assets[currentIndex],
            targetSize: target,
            contentMode: .aspectFit,
            options: options
        ) { [weak self] image, info in
            let degraded =
                (info?[PHImageResultIsDegradedKey] as? Bool) ?? false
            if degraded { return }

            DispatchQueue.main.async {
                guard let self,
                      requestedIndex == self.currentIndex else {
                    return
                }

                self.spinner.stopAnimating()
                self.currentImage = image
                self.imageView.image = image
            }
        }
    }

    private func requestShareImage() {
        guard assets.indices.contains(currentIndex) else {
            return
        }

        spinner.startAnimating()

        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .none
        options.isNetworkAccessAllowed = true

        PHImageManager.default().requestImageDataAndOrientation(
            for: assets[currentIndex],
            options: options
        ) { [weak self] data, _, _, _ in
            guard let self,
                  let data,
                  let image = UIImage(data: data) else {
                DispatchQueue.main.async {
                    self?.spinner.stopAnimating()
                }
                return
            }

            DispatchQueue.main.async {
                self.spinner.stopAnimating()
                self.currentImage = image
                self.presentShareSheet(image: image)
            }
        }
    }

    private func presentShareSheet(image: UIImage) {
        guard presentedViewController == nil else {
            return
        }

        let activity = UIActivityViewController(
            activityItems: [image],
            applicationActivities: nil
        )

        if let popover = activity.popoverPresentationController {
            popover.sourceView = imageView
            popover.sourceRect = CGRect(
                x: imageView.bounds.midX,
                y: imageView.bounds.midY,
                width: 1,
                height: 1
            )
            popover.permittedArrowDirections = []
        }

        present(activity, animated: true)
    }

    private func updateCounter() {
        counterLabel.text =
            "\(currentIndex + 1) / \(assets.count)"
    }

    private func cancelCurrentRequest() {
        if imageRequestID != PHInvalidImageRequestID {
            PHImageManager.default().cancelImageRequest(
                imageRequestID
            )
            imageRequestID = PHInvalidImageRequestID
        }
    }
}

