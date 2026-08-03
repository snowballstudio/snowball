package com.snowball.health;

import android.app.Dialog;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.res.Resources;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.PointF;
import android.graphics.RectF;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.View;
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
        /*
         * 华为旧系统对 ACTION_OPEN_DOCUMENT 的界面通常是“文件/下载”，
         * 而且可能忽略 EXTRA_ALLOW_MULTIPLE。
         *
         * 这里改为直接打开系统相册图库，不再套 Chooser。
         * 华为图库会收到明确的多选参数并返回 ClipData。
         */
        Intent intent = new Intent(
            Intent.ACTION_PICK,
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        );
        intent.setType("image/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.putExtra(
            Intent.EXTRA_MIME_TYPES,
            new String[]{
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/heic",
                "image/heif"
            }
        );
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        startActivityForResult(
            call,
            intent,
            "handlePhotoPickerResult"
        );
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
            & (
                Intent.FLAG_GRANT_READ_URI_PERMISSION
                    | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            );
        final boolean persistablePermissionGranted =
            (
                data.getFlags()
                    & Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            ) != 0;

        getBridge().executeOnMainThread(() -> {
            JSArray photos = new JSArray();
            int index = 0;

            for (Uri uri : uniqueUris) {
                try {
                    if (persistablePermissionGranted) {
                        try {
                            getContext()
                                .getContentResolver()
                                .takePersistableUriPermission(
                                    uri,
                                    takeFlags
                                        | Intent.FLAG_GRANT_READ_URI_PERMISSION
                                );
                        } catch (
                            SecurityException
                                | IllegalArgumentException ignored
                        ) {
                            // 厂商相册可能已自动保留权限。
                        }
                    }

                    try {
                        getContext().grantUriPermission(
                            getContext().getPackageName(),
                            uri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION
                        );
                    } catch (Exception ignored) {
                        // 部分相册已直接授予当前 APP 读取权限。
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
                    photo.put(
                        "source",
                        "android-photo-index-gallery"
                    );
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
        List<Uri> uris = new ArrayList<>();

        JSArray rawUris = call.getArray("uris");
        if (rawUris != null) {
            try {
                for (int i = 0; i < rawUris.length(); i++) {
                    String raw = rawUris.getString(i);
                    if (raw == null || raw.trim().isEmpty()) continue;
                    uris.add(Uri.parse(raw));
                }
            } catch (Exception ignored) {
                uris.clear();
            }
        }

        // 兼容旧版只传单个 uri 的调用。
        if (uris.isEmpty()) {
            String rawUri = call.getString("uri");
            if (rawUri != null && !rawUri.trim().isEmpty()) {
                try {
                    uris.add(Uri.parse(rawUri));
                } catch (Exception error) {
                    call.reject("照片索引格式不正确。");
                    return;
                }
            }
        }

        if (uris.isEmpty()) {
            call.reject("这组照片没有可用的系统索引。");
            return;
        }

        Integer requestedIndex = call.getInt("index");
        int initialIndex = requestedIndex == null ? 0 : requestedIndex;
        initialIndex = Math.max(0, Math.min(initialIndex, uris.size() - 1));

        final int safeInitialIndex = initialIndex;
        getActivity().runOnUiThread(() -> {
            try {
                showPhotoDialog(uris, safeInitialIndex);
                call.resolve();
            } catch (Exception error) {
                call.reject(
                    "原照片无法打开，可能已经被删除或权限已改变。",
                    error
                );
            }
        });
    }

    private void showPhotoDialog(List<Uri> uris, int initialIndex) {
        Dialog dialog = new Dialog(
            getActivity(),
            android.R.style.Theme_Black_NoTitleBar_Fullscreen
        );
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE);

        FrameLayout root = new FrameLayout(getActivity());
        root.setBackgroundColor(Color.BLACK);

        final int[] currentIndex = {initialIndex};

        ZoomableImageView image = new ZoomableImageView(getActivity());
        image.setBackgroundColor(Color.BLACK);

        Runnable showCurrentPhoto = () -> {
            Uri currentUri = uris.get(currentIndex[0]);
            image.resetForNewImage();
            image.setImageURI(currentUri);
            image.setContentDescription(
                "足迹原图 " + (currentIndex[0] + 1) + " / " + uris.size()
            );
        };

        image.setOnSwipeListener(direction -> {
            if (direction < 0 && currentIndex[0] < uris.size() - 1) {
                currentIndex[0] += 1;
                showCurrentPhoto.run();
            } else if (direction > 0 && currentIndex[0] > 0) {
                currentIndex[0] -= 1;
                showCurrentPhoto.run();
            }
        });

        image.setOnLongPressListener(() ->
            shareIndexedPhoto(uris.get(currentIndex[0]))
        );

        FrameLayout.LayoutParams imageParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        root.addView(image, imageParams);

        ImageButton close = new ImageButton(getActivity());
        close.setImageResource(
            android.R.drawable.ic_menu_close_clear_cancel
        );
        close.setColorFilter(Color.WHITE);
        close.setBackgroundColor(Color.TRANSPARENT);
        close.setContentDescription("关闭原图");
        close.setOnClickListener(v -> dialog.dismiss());

        int size = dp(48);
        FrameLayout.LayoutParams closeParams =
            new FrameLayout.LayoutParams(size, size);
        closeParams.gravity = Gravity.TOP | Gravity.END;
        closeParams.topMargin = dp(16);
        closeParams.rightMargin = dp(12);
        root.addView(close, closeParams);

        dialog.setContentView(root);
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(
                new ColorDrawable(Color.BLACK)
            );
            window.setLayout(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.MATCH_PARENT
            );
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                WindowManager.LayoutParams attributes =
                    window.getAttributes();
                attributes.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams
                        .LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                window.setAttributes(attributes);
            }
        }

        dialog.setOnShowListener(ignored -> showCurrentPhoto.run());
        dialog.show();
    }

    private void shareIndexedPhoto(Uri uri) {
        try {
            ContentResolver resolver =
                getContext().getContentResolver();
            String mimeType = resolver.getType(uri);
            if (mimeType == null || mimeType.trim().isEmpty()) {
                mimeType = "image/*";
            }

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType(mimeType);
            shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
            shareIntent.setClipData(
                ClipData.newRawUri("雪球照片", uri)
            );
            shareIntent.addFlags(
                Intent.FLAG_GRANT_READ_URI_PERMISSION
                    | Intent.FLAG_ACTIVITY_NEW_TASK
            );

            Intent chooser = Intent.createChooser(
                shareIntent,
                "转发照片"
            );
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
        } catch (Exception ignored) {
            // 分享失败时不关闭原图页面。
        }
    }

    private interface SwipeListener {
        void onSwipe(int direction);
    }

    private interface LongPressListener {
        void onLongPress();
    }

    private static class ZoomableImageView extends ImageView
        implements View.OnTouchListener {

        private static final float MAX_SCALE = 4.0f;
        private static final float SWIPE_DISTANCE = 90f;
        private static final float SWIPE_VELOCITY = 650f;

        private final Matrix matrix = new Matrix();
        private final PointF lastPoint = new PointF();

        private final ScaleGestureDetector scaleDetector;
        private final GestureDetector gestureDetector;

        private SwipeListener swipeListener;
        private LongPressListener longPressListener;

        private float currentScale = 1f;
        private boolean dragging = false;

        ZoomableImageView(android.content.Context context) {
            super(context);
            setScaleType(ScaleType.MATRIX);
            setImageMatrix(matrix);
            setOnTouchListener(this);
            setClickable(true);
            setLongClickable(true);

            scaleDetector = new ScaleGestureDetector(
                context,
                new ScaleGestureDetector.SimpleOnScaleGestureListener() {
                    @Override
                    public boolean onScaleBegin(
                        ScaleGestureDetector detector
                    ) {
                        dragging = false;
                        return true;
                    }

                    @Override
                    public boolean onScale(
                        ScaleGestureDetector detector
                    ) {
                        float factor = detector.getScaleFactor();
                        float target = currentScale * factor;

                        if (target < 1f) {
                            factor = 1f / currentScale;
                        } else if (target > MAX_SCALE) {
                            factor = MAX_SCALE / currentScale;
                        }

                        matrix.postScale(
                            factor,
                            factor,
                            detector.getFocusX(),
                            detector.getFocusY()
                        );
                        currentScale *= factor;
                        constrainTranslation();
                        setImageMatrix(matrix);
                        return true;
                    }
                }
            );

            gestureDetector = new GestureDetector(
                context,
                new GestureDetector.SimpleOnGestureListener() {
                    @Override
                    public boolean onDown(MotionEvent event) {
                        return true;
                    }

                    @Override
                    public void onLongPress(MotionEvent event) {
                        if (longPressListener != null) {
                            performHapticFeedback(
                                android.view.HapticFeedbackConstants
                                    .LONG_PRESS
                            );
                            longPressListener.onLongPress();
                        }
                    }

                    @Override
                    public boolean onDoubleTap(MotionEvent event) {
                        if (currentScale > 1.05f) {
                            resetToFit();
                        } else {
                            float factor = 2.5f;
                            matrix.postScale(
                                factor,
                                factor,
                                event.getX(),
                                event.getY()
                            );
                            currentScale = factor;
                            constrainTranslation();
                            setImageMatrix(matrix);
                        }
                        return true;
                    }

                    @Override
                    public boolean onFling(
                        MotionEvent first,
                        MotionEvent second,
                        float velocityX,
                        float velocityY
                    ) {
                        if (currentScale > 1.05f) return false;

                        float dx = second.getX() - first.getX();
                        float dy = second.getY() - first.getY();

                        if (
                            Math.abs(dx) < SWIPE_DISTANCE
                                || Math.abs(dx) <= Math.abs(dy)
                                || Math.abs(velocityX) < SWIPE_VELOCITY
                        ) {
                            return false;
                        }

                        if (swipeListener != null) {
                            swipeListener.onSwipe(dx < 0 ? -1 : 1);
                        }
                        return true;
                    }
                }
            );
        }

        void setOnSwipeListener(SwipeListener listener) {
            swipeListener = listener;
        }

        void setOnLongPressListener(LongPressListener listener) {
            longPressListener = listener;
        }

        void resetForNewImage() {
            currentScale = 1f;
            dragging = false;
            matrix.reset();
            setImageMatrix(matrix);
        }

        @Override
        public void setImageURI(@Nullable Uri uri) {
            super.setImageURI(uri);
            post(this::resetToFit);
        }

        @Override
        public boolean onTouch(View view, MotionEvent event) {
            scaleDetector.onTouchEvent(event);
            gestureDetector.onTouchEvent(event);

            if (event.getPointerCount() > 1) {
                dragging = false;
                return true;
            }

            switch (event.getActionMasked()) {
                case MotionEvent.ACTION_DOWN:
                    lastPoint.set(event.getX(), event.getY());
                    dragging = currentScale > 1.05f;
                    break;

                case MotionEvent.ACTION_MOVE:
                    if (dragging && currentScale > 1.05f) {
                        float dx = event.getX() - lastPoint.x;
                        float dy = event.getY() - lastPoint.y;
                        matrix.postTranslate(dx, dy);
                        constrainTranslation();
                        setImageMatrix(matrix);
                        lastPoint.set(event.getX(), event.getY());
                    }
                    break;

                case MotionEvent.ACTION_UP:
                case MotionEvent.ACTION_CANCEL:
                    dragging = false;
                    if (currentScale < 1.001f) {
                        resetToFit();
                    }
                    break;

                default:
                    break;
            }

            return true;
        }

        private void resetToFit() {
            Drawable drawable = getDrawable();
            if (
                drawable == null
                    || getWidth() <= 0
                    || getHeight() <= 0
                    || drawable.getIntrinsicWidth() <= 0
                    || drawable.getIntrinsicHeight() <= 0
            ) {
                return;
            }

            float viewWidth = getWidth();
            float viewHeight = getHeight();
            float drawableWidth = drawable.getIntrinsicWidth();
            float drawableHeight = drawable.getIntrinsicHeight();

            float fitScale = Math.min(
                viewWidth / drawableWidth,
                viewHeight / drawableHeight
            );

            float dx =
                (viewWidth - drawableWidth * fitScale) / 2f;
            float dy =
                (viewHeight - drawableHeight * fitScale) / 2f;

            matrix.reset();
            matrix.postScale(fitScale, fitScale);
            matrix.postTranslate(dx, dy);
            currentScale = 1f;
            setImageMatrix(matrix);
        }

        private void constrainTranslation() {
            Drawable drawable = getDrawable();
            if (
                drawable == null
                    || getWidth() <= 0
                    || getHeight() <= 0
            ) {
                return;
            }

            RectF rect = new RectF(
                0,
                0,
                drawable.getIntrinsicWidth(),
                drawable.getIntrinsicHeight()
            );
            matrix.mapRect(rect);

            float deltaX = 0f;
            float deltaY = 0f;

            if (rect.width() <= getWidth()) {
                deltaX = getWidth() / 2f - rect.centerX();
            } else if (rect.left > 0) {
                deltaX = -rect.left;
            } else if (rect.right < getWidth()) {
                deltaX = getWidth() - rect.right;
            }

            if (rect.height() <= getHeight()) {
                deltaY = getHeight() / 2f - rect.centerY();
            } else if (rect.top > 0) {
                deltaY = -rect.top;
            } else if (rect.bottom < getHeight()) {
                deltaY = getHeight() - rect.bottom;
            }

            matrix.postTranslate(deltaX, deltaY);
        }
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
