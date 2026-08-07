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

        // 足迹照片索引：只保存系统照片索引和小缩略图。
        bridge?.registerPluginInstance(IOSPhotoIndexPlugin())

        // iPhone 录音结束后恢复媒体播放通道。
        bridge?.registerPluginInstance(IOSAudioSessionPlugin())

        /*
         页面背景由网页中的当前页面负责。
         原生控制器和 WKWebView 不再强制铺黑色，避免物馆、人间等
         浅色页面在状态栏或 Home Indicator 区域露出全局黑边。

         本轮保留 capacitor 的 contentInset = always，
         因此只测试“取消原生黑底”，不改变现有 Safe Area 内容位置。
        */
        view.backgroundColor = .clear
        webView?.backgroundColor = .clear
        webView?.scrollView.backgroundColor = .clear
        webView?.isOpaque = false

        if #available(iOS 15.0, *) {
            webView?.underPageBackgroundColor = .clear
        }
    }
}
