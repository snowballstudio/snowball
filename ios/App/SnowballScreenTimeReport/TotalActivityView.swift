import SwiftUI

struct TotalActivityView: View {
    let configuration: TotalActivityConfiguration

    private let clock: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "zh_CN")
        f.dateFormat = "HH:mm:ss"
        return f
    }()

    private let dateTime: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "zh_CN")
        f.dateFormat = "yyyy/MM/dd HH:mm:ss"
        return f
    }()

    private func durationText(_ seconds: TimeInterval) -> String {
        let total = max(0, Int(seconds.rounded()))
        let h = total / 3600
        let m = (total % 3600) / 60
        let s = total % 60
        if h > 0 { return "\(h)小时\(m)分\(s)秒" }
        if m > 0 { return "\(m)分\(s)秒" }
        return "\(s)秒"
    }

    private func timeText(_ date: Date?) -> String {
        guard let date else { return "—" }
        return clock.string(from: date)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("当天总屏幕时间").font(.subheadline).foregroundStyle(.secondary)
                Text(durationText(configuration.totalDuration))
                    .font(.system(size: 31, weight: .semibold))

                Divider()
                Text("设备原始信息").font(.headline)
                ForEach(configuration.devices) { device in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(device.name).font(.body.weight(.medium))
                        Text("型号：\(device.model)")
                        Text("系统最后更新：\(dateTime.string(from: device.lastUpdatedDate))")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }

                Divider()
                Text("Activity Segments 原始时间").font(.headline)
                if configuration.segments.isEmpty {
                    Text("没有活动时段数据").foregroundStyle(.secondary)
                } else {
                    ForEach(configuration.segments) { segment in
                        VStack(alignment: .leading, spacing: 5) {
                            HStack {
                                Text("\(clock.string(from: segment.start))–\(clock.string(from: segment.end))")
                                    .font(.body.weight(.medium))
                                Spacer()
                                Text(durationText(segment.duration))
                                    .font(.body.weight(.medium))
                            }
                            Text("完整日期：\(dateTime.string(from: segment.start)) → \(dateTime.string(from: segment.end))")
                            Text("首次拿起：\(timeText(segment.firstPickup))")
                            Text("最长连续活动：\(timeText(segment.longestStart)) → \(timeText(segment.longestEnd))")
                            Text("无 App 活动的拿起次数：\(segment.pickupsWithoutApplication)")
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.vertical, 5)
                        Divider()
                    }
                }

                Divider()
                Text("类别与具体 App").font(.headline)
                ForEach(configuration.categories) { category in
                    VStack(alignment: .leading, spacing: 9) {
                        HStack {
                            Text(category.name).font(.headline)
                            Spacer()
                            Text(durationText(category.duration))
                                .font(.body.weight(.medium))
                        }

                        if category.applications.isEmpty {
                            Text("该类别没有返回应用详情")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(category.applications) { app in
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text(app.displayName)
                                            .font(.subheadline.weight(.medium))
                                        Spacer()
                                        Text(durationText(app.duration))
                                            .font(.subheadline)
                                    }
                                    if app.displayName != app.bundleIdentifier {
                                        Text(app.bundleIdentifier)
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                    Text("打开次数 \(app.pickups) · 通知 \(app.notifications)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                .padding(.leading, 10)
                                .padding(.vertical, 4)
                            }
                        }
                    }
                    .padding(.vertical, 6)
                    Divider()
                }
            }
            .padding(20)
        }
        .background(Color(uiColor: .systemBackground))
    }
}
