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

// MARK: - 主页七日平均屏时的原生计算视图

struct SevenDayAverageView: View {
    let configuration: SevenDayAverageConfiguration

    private func hoursText(_ duration: TimeInterval) -> String {
        String(
            format: "%.1f",
            max(0, duration) / 3600.0
        )
    }

    var body: some View {
        VStack(spacing: 7) {
            Text("七日平均屏时")
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(.secondary)

            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(hoursText(configuration.averageDuration))
                    .font(
                        .system(
                            size: 32,
                            weight: .semibold,
                            design: .rounded
                        )
                    )
                    .monospacedDigit()

                Text("小时")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.secondary)
            }

            Text("昨日及之前七个完整自然日")
                .font(.system(size: 10))
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(16)
        .background(Color(uiColor: .systemBackground))
    }
}

// MARK: - 昨日及之前七个完整自然日的原生屏幕时间表

struct SevenDayDailyTableView: View {
    let configuration: SevenDayAverageConfiguration

    private let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.autoupdatingCurrent
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "M/d"
        return formatter
    }()

    private func compactDuration(
        _ duration: TimeInterval
    ) -> String {
        let hours = max(0, duration) / 3600.0
        guard hours > 0 else {
            return "—"
        }
        return String(format: "%.1fh", hours)
    }

    private func rankedApps(
        for day: SevenDayScreenSummary
    ) -> [SevenDayApplicationSummary] {
        day.applications
            .filter {
                $0.duration > 0 || $0.pickups > 0
            }
            .sorted { left, right in
                if left.duration != right.duration {
                    return left.duration > right.duration
                }
                if left.pickups != right.pickups {
                    return left.pickups > right.pickups
                }
                return left.displayName < right.displayName
            }
    }

    private func topApps(
        for day: SevenDayScreenSummary
    ) -> [SevenDayApplicationSummary] {
        Array(rankedApps(for: day).prefix(10))
    }

    private func otherApp(
        for day: SevenDayScreenSummary
    ) -> SevenDayApplicationSummary? {
        let remaining = rankedApps(for: day).dropFirst(10)
        guard !remaining.isEmpty else {
            return nil
        }

        return SevenDayApplicationSummary(
            displayName: "其他",
            bundleIdentifier: "",
            categoryName: "其它",
            duration: remaining.reduce(0) {
                $0 + $1.duration
            },
            pickups: remaining.reduce(0) {
                $0 + $1.pickups
            }
        )
    }

    private func appCell(
        _ app: SevenDayApplicationSummary?
    ) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(app?.displayName ?? "—")
                .font(.system(size: 11, weight: .semibold))
                .lineLimit(1)

            if let app,
               app.duration > 0 || app.pickups > 0 {
                Text(
                    compactDuration(app.duration) +
                    " · " +
                    String(app.pickups) +
                    "次"
                )
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            } else {
                Text(" ")
                    .font(.system(size: 9))
            }
        }
        .frame(width: 88, alignment: .leading)
        .padding(.horizontal, 7)
        .padding(.vertical, 8)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Text("每日屏幕时间")
                        .font(.headline)
                    Text("昨日及之前七个完整自然日")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Text(
                    "七日平均 " +
                    compactDuration(
                        configuration.averageDuration
                    )
                )
                .font(.caption.weight(.semibold))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            Divider()

            ScrollView([.horizontal, .vertical]) {
                VStack(spacing: 0) {
                    HStack(spacing: 0) {
                        Text("日期")
                            .frame(width: 58, alignment: .leading)
                        Text("总时长")
                            .frame(width: 70, alignment: .leading)

                        ForEach(1...10, id: \.self) { index in
                            Text("TOP \(index)")
                                .frame(
                                    width: 102,
                                    alignment: .leading
                                )
                        }

                        Text("其他")
                            .frame(width: 102, alignment: .leading)
                    }
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 9)
                    .background(
                        Color(uiColor: .secondarySystemBackground)
                    )

                    ForEach(
                        configuration.days.reversed(),
                        id: \.date
                    ) { day in
                        let apps = topApps(for: day)
                        let other = otherApp(for: day)

                        HStack(spacing: 0) {
                            Text(dateFormatter.string(from: day.date))
                                .font(
                                    .system(
                                        size: 12,
                                        weight: .semibold,
                                        design: .rounded
                                    )
                                )
                                .frame(
                                    width: 58,
                                    alignment: .leading
                                )

                            Text(
                                compactDuration(day.totalDuration)
                            )
                            .font(
                                .system(
                                    size: 12,
                                    weight: .semibold,
                                    design: .rounded
                                )
                            )
                            .frame(
                                width: 70,
                                alignment: .leading
                            )

                            ForEach(0..<10, id: \.self) { index in
                                appCell(
                                    index < apps.count
                                    ? apps[index]
                                    : nil
                                )
                            }

                            appCell(other)
                        }
                        .padding(.horizontal, 10)
                        .background(
                            Color(uiColor: .systemBackground)
                        )

                        Divider()
                    }
                }
            }
        }
        .background(Color(uiColor: .systemBackground))
    }
}

struct SnowballHomeMiniView: View {
    let configuration: SnowballHomeMiniConfiguration

    private let clockFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "zh_CN")
        formatter.dateFormat = "H：mm"
        return formatter
    }()

    var body: some View {
        let average = String(
            format: "%.1f",
            configuration.sevenDayAverageHours
        )
        let last = configuration.lastActivityDate.map {
            clockFormatter.string(from: $0)
        } ?? "—"

        Text("\(average)，末次\(last)")
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(Color(red: 0.09, green: 0.64, blue: 0.86))
            .lineLimit(1)
            .minimumScaleFactor(0.72)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(Color.clear)
    }
}

struct SnowballDashboardView: View {
    let configuration: SnowballDashboardConfiguration

    private func durationText(_ seconds: TimeInterval) -> String {
        let minutes = max(0, Int((seconds / 60).rounded()))
        if minutes < 60 {
            return "\(minutes)分"
        }
        return String(format: "%.1f小时", Double(minutes) / 60.0)
    }

    private var maximumCategoryDuration: TimeInterval {
        max(
            configuration.categories.map(\.duration).max() ?? 0,
            1
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack(alignment: .firstTextBaseline) {
                    Text(configuration.rangeLabel)
                        .font(.title2.weight(.semibold))
                    Spacer()
                    Text("合计 \(durationText(configuration.totalDuration))")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 0) {
                    HStack {
                        Text("APP")
                        Spacer()
                        Text("时间")
                            .frame(width: 82, alignment: .trailing)
                        Text("打开")
                            .frame(width: 54, alignment: .trailing)
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.vertical, 8)

                    Divider()

                    ForEach(
                        Array(configuration.applications.enumerated()),
                        id: \.element.id
                    ) { index, row in
                        HStack {
                            Text("\(index + 1). \(row.name)")
                                .lineLimit(1)
                            Spacer()
                            Text(durationText(row.duration))
                                .frame(width: 82, alignment: .trailing)
                            Text("\(row.pickups)")
                                .frame(width: 54, alignment: .trailing)
                        }
                        .font(.subheadline)
                        .padding(.vertical, 7)

                        Divider()
                    }

                    if configuration.otherDuration > 0 {
                        HStack {
                            Text("其它")
                            Spacer()
                            Text(durationText(configuration.otherDuration))
                                .frame(width: 82, alignment: .trailing)
                            Text("—")
                                .frame(width: 54, alignment: .trailing)
                        }
                        .font(.subheadline)
                        .padding(.vertical, 7)

                        Divider()
                    }

                    HStack {
                        Text("合计")
                            .fontWeight(.semibold)
                        Spacer()
                        Text(durationText(configuration.totalDuration))
                            .fontWeight(.semibold)
                            .frame(width: 82, alignment: .trailing)
                        Text("")
                            .frame(width: 54)
                    }
                    .font(.subheadline)
                    .padding(.vertical, 8)
                }

                Divider()

                Text("类型分布")
                    .font(.headline)

                VStack(alignment: .leading, spacing: 12) {
                    ForEach(configuration.categories) { row in
                        VStack(alignment: .leading, spacing: 5) {
                            HStack {
                                Text(row.name)
                                    .font(.caption)
                                Spacer()
                                Text(durationText(row.duration))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            GeometryReader { proxy in
                                let ratio = max(
                                    0,
                                    min(
                                        1,
                                        row.duration / maximumCategoryDuration
                                    )
                                )

                                ZStack(alignment: .leading) {
                                    Capsule()
                                        .fill(Color.secondary.opacity(0.14))
                                    Capsule()
                                        .fill(Color.accentColor.opacity(0.82))
                                        .frame(
                                            width: proxy.size.width * ratio
                                        )
                                }
                            }
                            .frame(height: 9)
                        }
                    }
                }
            }
            .padding(18)
        }
        .background(Color(.systemBackground))
    }
}

