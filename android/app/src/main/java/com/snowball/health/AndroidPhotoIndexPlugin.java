package com.snowball.health;

import android.app.Dialog;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;

import androidx.annotation.Nullable;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import android.util.Base64;

@CapacitorPlugin(name = "AndroidPhotoIndex")
public class AndroidPhotoIndexPlugin extends Plugin {

    @PluginMethod
    public void pickPhotos(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );

        startActivityForResult(call, intent, "handlePhotoPickerResult");
    }

    @ActivityCallback
    private void handlePhotoPickerResult(PluginCall call, @Nullable androidx.activity.result.ActivityResult result) {
        if (call == null) return;

        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK) {
            JSObject cancelled = new JSObject();
            cancelled.put("photos", new JSArray());
            call.resolve(cancelled);
            return;
        }

        Intent data = result.getData();
        if (data == null) {
            call.reject("系统没有返回照片。");
            return;
        }

        Set<Uri> uniqueUris = new LinkedHashSet<>();
        ClipData clipData = data.getClipData();

        if (clipData != null) {
            for (int i = 0; i < clipData.getItemCount(); i++) {
                Uri uri = clipData.getItemAt(i).getUri();
                if (uri != null) uniqueUris.add(uri);
            }
        } else if (data.getData() != null) {
            uniqueUris.add(data.getData());
        }

        if (uniqueUris.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("photos", new JSArray());
            call.resolve(empty);
            return;
        }

        final int takeFlags = data.getFlags()
            & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);

        getBridge().executeOnMainThread(() -> {
            JSArray photos = new JSArray();
            int index = 0;

            for (Uri uri : uniqueUris) {
                try {
                    try {
                        getContext().getContentResolver().takePersistableUriPermission(
                            uri,
                            takeFlags | Intent.FLAG_GRANT_READ_URI_PERMISSION
                        );
                    } catch (SecurityException ignored) {
                        // 部分厂商选择器已自动保留读取权，无法重复申请时继续使用。
                    }

                    ImageInfo info = readImageInfo(uri);
                    String thumbnail = createThumbnailDataUrl(uri, 320);

                    JSObject photo = new JSObject();
                    photo.put("id", "android-photo-" + System.currentTimeMillis() + "-" + index);
                    photo.put("uri", uri.toString());
                    photo.put("assetIdentifier", "");
                    photo.put("thumbnail", thumbnail);
                    photo.put("width", info.width);
                    photo.put("height", info.height);
                    photo.put("filename", queryDisplayName(uri));
                    photo.put("source", "android-photo-index");
                    photos.put(photo);
                    index += 1;
                } catch (Exception error) {
                    // 单张失败不影响其它已经选中的照片。
                }
            }

            JSObject response = new JSObject();
            response.put("photos", photos);
            call.resolve(response);
        });
    }

    @PluginMethod
    public void presentPhoto(PluginCall call) {
        String rawUri = call.getString("uri");
        if (rawUri == null || rawUri.trim().isEmpty()) {
            call.reject("这张照片没有可用的系统索引。");
            return;
        }

        Uri uri;
        try {
            uri = Uri.parse(rawUri);
        } catch (Exception error) {
            call.reject("照片索引格式不正确。");
            return;
        }

        getActivity().runOnUiThread(() -> {
            try {
                showPhotoDialog(uri);
                call.resolve();
            } catch (Exception error) {
                call.reject("原照片无法打开，可能已经被删除或权限已改变。", error);
            }
        });
    }

    private void showPhotoDialog(Uri uri) {
        Dialog dialog = new Dialog(getActivity(), android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        FrameLayout root = new FrameLayout(getActivity());
        root.setBackgroundColor(Color.BLACK);

        ImageView image = new ImageView(getActivity());
        image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        image.setAdjustViewBounds(true);
        image.setImageURI(uri);

        FrameLayout.LayoutParams imageParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        root.addView(image, imageParams);

        ImageButton close = new ImageButton(getActivity());
        close.setImageResource(android.R.drawable.ic_menu_close_clear_cancel);
        close.setColorFilter(Color.WHITE);
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setContentDescription("关闭原图");
        close.setOnClickListener(v -> dialog.dismiss());

        int size = dp(48);
        FrameLayout.LayoutParams closeParams = new FrameLayout.LayoutParams(size, size);
        closeParams.gravity = Gravity.TOP | Gravity.END;
        closeParams.topMargin = dp(16);
        closeParams.rightMargin = dp(12);
        root.addView(close, closeParams);

        dialog.setContentView(root);
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.BLACK));
            window.setLayout(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT
            );
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams attributes = window.getAttributes();
                attributes.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                window.setAttributes(attributes);
            }
        }
        dialog.show();
    }

    private ImageInfo readImageInfo(Uri uri) throws Exception {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;

        try (InputStream stream = getContext().getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(stream, null, options);
        }

        return new ImageInfo(
            Math.max(0, options.outWidth),
            Math.max(0, options.outHeight)
        );
    }

    private String createThumbnailDataUrl(Uri uri, int maxSide) throws Exception {
        ImageInfo info = readImageInfo(uri);
        int largest = Math.max(1, Math.max(info.width, info.height));
        int sampleSize = 1;

        while (largest / sampleSize > maxSide * 2) {
            sampleSize *= 2;
        }

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = Math.max(1, sampleSize);
        options.inPreferredConfig = Bitmap.Config.RGB_565;

        Bitmap bitmap;
        try (InputStream stream = getContext().getContentResolver().openInputStream(uri)) {
            bitmap = BitmapFactory.decodeStream(stream, null, options);
        }

        if (bitmap == null) {
            throw new IllegalStateException("无法生成缩略图。");
        }

        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        float ratio = Math.min(1f, (float) maxSide / Math.max(width, height));
        int targetWidth = Math.max(1, Math.round(width * ratio));
        int targetHeight = Math.max(1, Math.round(height * ratio));

        Bitmap scaled = bitmap;
        if (targetWidth != width || targetHeight != height) {
            scaled = Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true);
        }

        ByteArrayOutputStream output = new ByteArrayOutputStream();
        scaled.compress(Bitmap.CompressFormat.JPEG, 58, output);
        String encoded = Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP);

        if (scaled != bitmap) scaled.recycle();
        bitmap.recycle();
        output.close();

        return "data:image/jpeg;base64," + encoded;
    }

    private String queryDisplayName(Uri uri) {
        ContentResolver resolver = getContext().getContentResolver();
        try (android.database.Cursor cursor = resolver.query(
            uri,
            new String[]{OpenableColumns.DISPLAY_NAME},
            null,
            null,
            null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (index >= 0) return cursor.getString(index);
            }
        } catch (Exception ignored) {
        }
        return "";
    }

    private int dp(int value) {
        return Math.round(value * Resources.getSystem().getDisplayMetrics().density);
    }

    private static class ImageInfo {
        final int width;
        final int height;

        ImageInfo(int width, int height) {
            this.width = width;
            this.height = height;
        }
    }
}
