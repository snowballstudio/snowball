import SwiftUI

struct TotalActivityView: View {
    let configuration: TotalActivityConfiguration

    private let clockFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "HH:mm:ss"
        return formatter
    }()

    private let dateTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "yyyy/MM/dd HH:mm:ss"
        return formatter
    }()

    private func durationText(_ seconds: TimeInterval) -> String {
        let total = max(0, Int(seconds.rounded()))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let remainder = total % 60

        if hours > 0 {
            return "\(hours)小时\(minutes)分\(remainder)秒"
        }

        if minutes > 0 {
            return "\(minutes)分\(remainder)秒"
        }

        return "\(remainder)秒"
    }

    private func optionalTime(_ date: Date?) -> String {
        guard let date else {
            return "—"
        }

        return clockFormatter.string(from: date)
    }

    private func applications(
        for segment: ScreenTimeSegmentRow
    ) -> [ScreenTimeApplicationRow] {
        configuration.applications.filter { app in
            app.segmentStart == segment.start &&
            app.segmentEnd == segment.end
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("当天总屏幕时间")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Text(durationText(configuration.totalDuration))
                        .font(.system(size: 31, weight: .semibold))
                }

                Divider()

                Text("设备原始信息")
                    .font(.headline)

                ForEach(configuration.devices) { device in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(device.name)
                            .font(.body.weight(.medium))

                        Text("型号：\(device.model)")

                        Text(
                            "系统最后更新：" +
                            dateTimeFormatter.string(
                                from: device.lastUpdatedDate
                            )
                        )
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }

                Divider()

                Text("小时分段与具体 App")
                    .font(.headline)

                if configuration.segments.isEmpty {
                    Text("没有活动时段数据")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(configuration.segments) { segment in
                        let segmentApps = applications(for: segment)

                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(
                                    clockFormatter.string(
                                        from: segment.start
                                    ) +
                                    "–" +
                                    clockFormatter.string(
                                        from: segment.end
                                    )
                                )
                                .font(.body.weight(.semibold))

                                Spacer()

                                Text(durationText(segment.duration))
                                    .font(.body.weight(.semibold))
                            }

                            Text(
                                "首次拿起：" +
                                optionalTime(segment.firstPickup)
                            )

                            Text(
                                "最长连续活动：" +
                                optionalTime(segment.longestStart) +
                                " → " +
                                optionalTime(segment.longestEnd)
                            )

                            Text(
                                "无 App 活动的拿起次数：" +
                                String(
                                    segment.pickupsWithoutApplication
                                )
                            )

                            if segmentApps.isEmpty {
                                Text("这个小时没有返回具体 App")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .padding(.top, 4)
                            } else {
                                ForEach(segmentApps) { app in
                                    VStack(
                                        alignment: .leading,
                                        spacing: 4
                                    ) {
                                        HStack(
                                            alignment: .firstTextBaseline
                                        ) {
                                            Text(app.displayName)
                                                .font(
                                                    .subheadline
                                                        .weight(.medium)
                                                )

                                            Spacer()

                                            Text(
                                                durationText(app.duration)
                                            )
                                            .font(.subheadline)
                                        }

                                        Text(
                                            "类别：\(app.categoryName)"
                                        )

                                        if app.displayName
                                            != app.bundleIdentifier {
                                            Text(
                                                "Bundle ID：" +
                                                app.bundleIdentifier
                                            )
                                        }

                                        Text(
                                            "打开次数 " +
                                            String(app.pickups) +
                                            " · 通知 " +
                                            String(app.notifications)
                                        )
                                    }
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .padding(.leading, 12)
                                    .padding(.vertical, 5)
                                }
                            }
                        }
                        .padding(.vertical, 6)

                        Divider()
                    }
                }
            }
            .padding(20)
        }
        .background(Color(uiColor: .systemBackground))
    }
}
