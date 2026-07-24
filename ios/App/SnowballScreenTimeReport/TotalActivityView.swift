//
//  TotalActivityView.swift
//  SnowballScreenTimeReport
//

import SwiftUI

struct TotalActivityView: View {
    let configuration: SnowballTotalActivityConfiguration

    private func durationText(_ seconds: TimeInterval) -> String {
        let minutes = max(0, Int((seconds / 60).rounded()))
        let hours = minutes / 60
        let remainder = minutes % 60

        if hours == 0 {
            return "\(remainder)分"
        }

        if remainder == 0 {
            return "\(hours)小时"
        }

        return "\(hours)小时\(remainder)分"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("当天总屏幕时间")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(durationText(configuration.totalDuration))
                        .font(.system(size: 34, weight: .semibold))
                    Text("系统返回 \(configuration.segmentCount) 个活动时段")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Divider()

                Text("Apple 系统类别")
                    .font(.headline)

                if configuration.categories.isEmpty {
                    Text("没有读到类别数据。请确认系统“屏幕使用时间”已开启，并在当天使用过手机。")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(configuration.categories) { item in
                        VStack(alignment: .leading, spacing: 7) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(item.name)
                                    .font(.body)
                                Spacer()
                                Text(durationText(item.duration))
                                    .font(.body.weight(.medium))
                            }

                            Text("打开次数 \(item.pickups) · 类别内应用 \(item.applicationCount)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 6)

                        Divider()
                    }
                }
            }
            .padding(18)
        }
        .background(Color(uiColor: .systemBackground))
    }
}

#Preview {
    TotalActivityView(
        configuration: SnowballTotalActivityConfiguration(
            totalDuration: 5_400,
            categories: [
                SnowballCategoryActivity(
                    id: "社交",
                    name: "社交",
                    duration: 3_000,
                    pickups: 18,
                    applicationCount: 4
                )
            ],
            segmentCount: 1
        )
    )
}
