import Capacitor
import Foundation
import Photos
import PhotosUI
import UIKit

@objc(IOSPhotoIndexPlugin)
public final class IOSPhotoIndexPlugin: CAPPlugin,
    CAPBridgedPlugin,
    PHPickerViewControllerDelegate {

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
        )
    ]

    private var pendingPickerCall: CAPPluginCall?

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

    @objc public func presentPhoto(_ call: CAPPluginCall) {
        guard let identifier = call.getString("assetIdentifier"),
              !identifier.isEmpty else {
            call.reject("缺少照片索引。")
            return
        }

        requestPhotoLibraryAccess { [weak self] granted in
            guard let self else { return }

            guard granted else {
                DispatchQueue.main.async {
                    call.reject("雪粒没有读取这张原图的权限。")
                }
                return
            }

            let assets = PHAsset.fetchAssets(
                withLocalIdentifiers: [identifier],
                options: nil
            )

            guard let asset = assets.firstObject else {
                DispatchQueue.main.async {
                    call.reject("原照片已不在系统相册中，或访问权限已被取消。")
                }
                return
            }

            DispatchQueue.main.async {
                guard let presenter = self.bridge?.viewController else {
                    call.reject("找不到雪粒主页面。")
                    return
                }

                let viewer = SnowballIndexedPhotoViewController(
                    asset: asset
                )
                viewer.modalPresentationStyle = .fullScreen
                presenter.present(viewer, animated: true) {
                    call.resolve([
                        "opened": true,
                        "assetIdentifier": identifier
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
    UIScrollViewDelegate {

    private let asset: PHAsset
    private let scrollView = UIScrollView()
    private let imageView = UIImageView()
    private let spinner = UIActivityIndicatorView(style: .large)
    private var imageRequestID: PHImageRequestID =
        PHInvalidImageRequestID

    init(asset: PHAsset) {
        self.asset = asset
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

        imageView.translatesAutoresizingMaskIntoConstraints = false
        imageView.contentMode = .scaleAspectFit

        spinner.translatesAutoresizingMaskIntoConstraints = false
        spinner.color = .white
        spinner.startAnimating()

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

        view.addSubview(scrollView)
        scrollView.addSubview(imageView)
        view.addSubview(spinner)
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

        loadPhoto()
    }

    deinit {
        if imageRequestID != PHInvalidImageRequestID {
            PHImageManager.default().cancelImageRequest(
                imageRequestID
            )
        }
    }

    func viewForZooming(
        in scrollView: UIScrollView
    ) -> UIView? {
        imageView
    }

    @objc private func closeViewer() {
        dismiss(animated: true)
    }

    private func loadPhoto() {
        let scale = UIScreen.main.scale
        let target = CGSize(
            width: max(view.bounds.width, 1) * scale * 2,
            height: max(view.bounds.height, 1) * scale * 2
        )

        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .none
        options.isNetworkAccessAllowed = true

        imageRequestID = PHImageManager.default().requestImage(
            for: asset,
            targetSize: target,
            contentMode: .aspectFit,
            options: options
        ) { [weak self] image, info in
            let degraded =
                (info?[PHImageResultIsDegradedKey] as? Bool) ?? false
            if degraded { return }

            DispatchQueue.main.async {
                self?.spinner.stopAnimating()
                self?.imageView.image = image
            }
        }
    }
}
