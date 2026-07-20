import UIKit
import Capacitor

@objc(MainViewController)
public final class MainViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        super.capacitorDidLoad()

        // 注册雪粒的 iOS 原生数据插件。
        bridge?.registerPluginInstance(DeviceDataPlugin())

        // iOS 原生层背景。用于覆盖网页内容之外的状态栏、
        // Home Indicator 安全区及 WebView 加载瞬间可能出现的白色区域。
        let snowballBackground = UIColor.black

        view.backgroundColor = snowballBackground
        webView?.backgroundColor = snowballBackground
        webView?.scrollView.backgroundColor = snowballBackground
        webView?.isOpaque = true

        if #available(iOS 15.0, *) {
            webView?.underPageBackgroundColor = snowballBackground
        }
    }
}
