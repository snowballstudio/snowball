package com.snowball.health

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

class PermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(TextView(this).apply {
            text = "雪球只在本机读取经你授权的步数，用于生成个人生活数据和猫咪状态。数据不会上传云端，也不会提供给第三方。"
            textSize = 18f
            setPadding(48, 72, 48, 48)
        })
    }
}
