import Foundation
import AVFAudio
import Capacitor

@objc(IOSAudioSessionPlugin)
public class IOSAudioSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IOSAudioSessionPlugin"
    public let jsName = "IOSAudioSession"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "restorePlayback", returnType: CAPPluginReturnPromise)
    ]

    @objc public func restorePlayback(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let session = AVAudioSession.sharedInstance()

            do {
                // 先结束语音识别留下的录音会话，再明确切回普通媒体播放。
                try session.setActive(
                    false,
                    options: [.notifyOthersOnDeactivation]
                )

                try session.setCategory(
                    .playback,
                    mode: .default,
                    options: []
                )

                try session.setActive(true)

                call.resolve([
                    "restored": true,
                    "category": session.category.rawValue,
                    "mode": session.mode.rawValue
                ])
            } catch {
                let nsError = error as NSError
                call.reject(
                    "恢复 iPhone 播放通道失败：\(nsError.localizedDescription)",
                    nil,
                    error
                )
            }
        }
    }
}
