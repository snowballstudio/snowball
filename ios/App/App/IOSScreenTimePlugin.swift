import Foundation
import Capacitor
import DeviceActivity
import FamilyControls
import SwiftUI
import UIKit

@objc(IOSScreenTimePlugin)
public class IOSScreenTimePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "IOSScreenTimePlugin"
    public let jsName = "IOSScreenTime"

    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentReport", returnType: CAPPluginReturnPromise)
    ]

    @objc public func getAuthorizationStatus(_ call: CAPPluginCall) {
        call.resolve(statusPayload())
    }

    @objc public func requestAuthorization(_ call: CAPPluginCall) {
        Task {
            do {
                try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
                await MainActor.run {
                    call.resolve(self.statusPayload())
                }
            } catch {
                await MainActor.run {
                    call.reject(
                        "苹果屏幕时间授权失败：\(error.localizedDescription)",
                        nil,
                        error
                    )
                }
            }
        }
    }

    @objc public func presentReport(_ call: CAPPluginCall) {
        guard AuthorizationCenter.shared.authorizationStatus == .approved else {
            call.reject("请先授权苹果屏幕时间。")
            return
        }

        let date = parseSnowballDate(call.getString("date")) ?? Date()
        let calendar = Calendar.autoupdatingCurrent
        let dayStart = calendar.startOfDay(for: date)

        // 非整点窗口实验：
        // 请求当天 00:15 到次日 00:15，并继续使用 hourly。
        // 报告页会显示 Apple 实际返回的 Segment 起止时间。
        guard
            let start = calendar.date(
                byAdding: .minute,
                value: 15,
                to: dayStart
            ),
            let nextDayStart = calendar.date(
                byAdding: .day,
                value: 1,
                to: dayStart
            ),
            let end = calendar.date(
                byAdding: .minute,
                value: 15,
                to: nextDayStart
            )
        else {
            call.reject("无法计算非整点报告区间。")
            return
        }

        let interval = DateInterval(start: start, end: end)
        let filter = DeviceActivityFilter(
            segment: .hourly(during: interval),
            users: .all,
            devices: .all
        )

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("找不到雪球主页面。")
                return
            }

            let context = DeviceActivityReport.Context("Total Activity")
            let reportView = IOSScreenTimeReportContainer(
                context: context,
                filter: filter,
                dateText: self.formatSnowballDate(dayStart) + "（请求00:15–次日00:15）",
                onClose: {
                    presenter.dismiss(animated: true)
                }
            )

            let host = UIHostingController(rootView: reportView)
            host.modalPresentationStyle = .fullScreen
            presenter.present(host, animated: true) {
                call.resolve([
                    "opened": true,
                    "date": self.formatSnowballDate(dayStart)
                ])
            }
        }
    }

    private func statusPayload() -> [String: Any] {
        let status = AuthorizationCenter.shared.authorizationStatus

        if status == .approved {
            return [
                "available": true,
                "status": "approved",
                "statusLabel": "已授权"
            ]
        }

        if status == .denied {
            return [
                "available": true,
                "status": "denied",
                "statusLabel": "已拒绝"
            ]
        }

        if status == .notDetermined {
            return [
                "available": true,
                "status": "notDetermined",
                "statusLabel": "未询问"
            ]
        }

        return [
            "available": true,
            "status": "unknown",
            "statusLabel": "未知状态"
        ]
    }

    private func parseSnowballDate(_ value: String?) -> Date? {
        guard let text = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !text.isEmpty else {
            return nil
        }

        let formatter = DateFormatter()
        formatter.calendar = Calendar.autoupdatingCurrent
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = Calendar.autoupdatingCurrent.timeZone

        for format in ["yyyy/M/d", "yyyy-MM-dd"] {
            formatter.dateFormat = format
            if let date = formatter.date(from: text) {
                return date
            }
        }

        return nil
    }

    private func formatSnowballDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.autoupdatingCurrent
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = Calendar.autoupdatingCurrent.timeZone
        formatter.dateFormat = "yyyy/M/d"
        return formatter.string(from: date)
    }
}

private struct IOSScreenTimeReportContainer: View {
    let context: DeviceActivityReport.Context
    let filter: DeviceActivityFilter
    let dateText: String
    let onClose: () -> Void

    var body: some View {
        NavigationStack {
            DeviceActivityReport(context, filter: filter)
                .navigationTitle("苹果屏幕时间 \(dateText)")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("关闭", action: onClose)
                    }
                }
        }
    }
}
