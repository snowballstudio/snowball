import UIKit
import Capacitor

@objc(MainViewController)
public final class MainViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        super.capacitorDidLoad()

        // 雪粒现有 iOS 原生数据插件：HealthKit 步数。
        bridge?.registerPluginInstance(DeviceDataPlugin())

        // 苹果屏幕时间：授权状态与打开 DeviceActivityReport。
        bridge?.registerPluginInstance(IOSScreenTimePlugin())

        // iPhone 录音结束后恢复媒体播放通道。
        bridge?.registerPluginInstance(IOSAudioSessionPlugin())

        // 覆盖状态栏、安全区和 WebView 加载时可能出现的白色区域。
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
