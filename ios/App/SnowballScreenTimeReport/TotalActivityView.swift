//
//  TotalActivityView.swift
//  SnowballScreenTimeReport
//
//  Created by Jason Zhao on 24/7/2026.
//

import SwiftUI

struct TotalActivityView: View {
    let configuration: TotalActivityConfiguration

    private func durationText(_ seconds: TimeInterval) -> String {
        let totalMinutes = max(0, Int((seconds / 60).rounded()))
        let hours = totalMinutes / 60
        let minutes = totalMinutes % 60

        if hours == 0 {
            return "\(minutes)分"
        }

        if minutes == 0 {
            return "\(hours)小时"
        }

        return "\(hours)小时\(minutes)分"
    }

    private func percentageText(_ seconds: TimeInterval) -> String {
        guard configuration.totalDuration > 0 else {
            return "0%"
        }

        let percent = Int(
            ((seconds / configuration.totalDuration) * 100).rounded()
        )
        return "\(max(0, percent))%"
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("当天总屏幕时间")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    Text(durationText(configuration.totalDuration))
                        .font(.system(size: 34, weight: .semibold))
                        .foregroundStyle(.primary)
                }

                Divider()

                Text("Apple 系统类别")
                    .font(.headline)

                if configuration.categories.isEmpty {
                    Text("当天有总时长，但没有返回可显示的系统类别。")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(configuration.categories) { item in
                        VStack(spacing: 8) {
                            HStack(alignment: .firstTextBaseline, spacing: 12) {
                                Text(item.name)
                                    .font(.body)

                                Spacer()

                                Text(durationText(item.duration))
                                    .font(.body.weight(.medium))
                            }

                            HStack {
                                GeometryReader { proxy in
                                    let ratio =
                                        configuration.totalDuration > 0
                                        ? item.duration / configuration.totalDuration
                                        : 0

                                    ZStack(alignment: .leading) {
                                        Capsule()
                                            .fill(Color.secondary.opacity(0.14))

                                        Capsule()
                                            .fill(Color.accentColor.opacity(0.72))
                                            .frame(
                                                width: max(
                                                    2,
                                                    proxy.size.width * ratio
                                                )
                                            )
                                    }
                                }
                                .frame(height: 6)

                                Text(percentageText(item.duration))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .frame(width: 42, alignment: .trailing)
                            }
                        }
                        .padding(.vertical, 4)

                        Divider()
                    }
                }
            }
            .padding(20)
        }
        .background(Color(uiColor: .systemBackground))
    }
}

#Preview {
    TotalActivityView(
        configuration: TotalActivityConfiguration(
            totalDuration: 4_800,
            categories: [
                ScreenTimeCategoryRow(
                    id: "社交",
                    name: "社交",
                    duration: 2_400
                ),
                ScreenTimeCategoryRow(
                    id: "娱乐",
                    name: "娱乐",
                    duration: 1_200
                )
            ]
        )
    )
}
