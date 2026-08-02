import FamilyControls
import SwiftUI

struct IOSMonitorAppPickerView: View {
    @State private var selection = FamilyActivitySelection(
        includeEntireCategory: false
    )
    @State private var validationMessage = ""

    let onSave: (FamilyActivitySelection) -> Void
    let onCancel: () -> Void

    private var canSave: Bool {
        selection.applicationTokens.count == 1
            && selection.categoryTokens.isEmpty
            && selection.webDomainTokens.isEmpty
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if !validationMessage.isEmpty {
                    Text(validationMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }

                FamilyActivityPicker(selection: $selection)
            }
            .navigationTitle("选择一个测试 App")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("取消", action: onCancel)
                }

                ToolbarItem(placement: .topBarTrailing) {
                    Button("保存") {
                        guard canSave else {
                            validationMessage =
                                "请只选择一个 App，不要选择整个类别或网站。"
                            return
                        }
                        onSave(selection)
                    }
                    .fontWeight(.semibold)
                }
            }
            .safeAreaInset(edge: .bottom) {
                Text("请只勾选微信，然后点右上角“保存”。本选择只用于本次 Monitor 验证。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity)
                    .background(.thinMaterial)
            }
            .onChange(of: selection) { _ in
                validationMessage = ""
            }
        }
    }
}
