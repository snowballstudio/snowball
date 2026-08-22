package com.snowball.health;

import android.app.Dialog;
import android.content.ClipData;
import android.content.ContentUris;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.res.Resources;
import android.database.Cursor;
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
import android.widget.TextView;
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
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import android.util.Base64;

@CapacitorPlugin(name = "AndroidPhotoIndex")
public class AndroidPhotoIndexPlugin extends Plugin {

    private static final String PHOTO_URI_PREFS =
        "snowball_photo_uri_map_v1";

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(
                String.valueOf(value).getBytes(StandardCharsets.UTF_8)
            );

            StringBuilder builder = new StringBuilder();
            for (byte item : bytes) {
                builder.append(
                    String.format(
                        java.util.Locale.ROOT,
                        "%02x",
                        item & 0xff
                    )
                );
            }
            return builder.toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    private String queryStableAssetKey(Uri uri) {
        if (uri == null) return "";

        ContentResolver resolver = getContext().getContentResolver();

        try (
            Cursor cursor = resolver.query(
                uri,
                new String[] {
                    MediaStore.Images.Media._ID,
                    OpenableColumns.DISPLAY_NAME,
                    OpenableColumns.SIZE,
                    MediaStore.Images.Media.DATE_ADDED,
                    MediaStore.Images.Media.WIDTH,
                    MediaStore.Images.Media.HEIGHT
                },
                null,
                null,
                null
            )
        ) {
            if (cursor != null && cursor.moveToFirst()) {
                int idIndex = cursor.getColumnIndex(
                    MediaStore.Images.Media._ID
                );

                if (idIndex >= 0 && !cursor.isNull(idIndex)) {
                    long mediaId = cursor.getLong(idIndex);
                    if (mediaId > 0L) {
                        return "android-media:" + mediaId;
                    }
                }

                String name = "";
                long size = 0L;
                long added = 0L;
                int width = 0;
                int height = 0;

                int nameIndex = cursor.getColumnIndex(
                    OpenableColumns.DISPLAY_NAME
                );
                if (nameIndex >= 0 && !cursor.isNull(nameIndex)) {
                    name = String.valueOf(
                        cursor.getString(nameIndex)
                    ).trim();
                }

                int sizeIndex = cursor.getColumnIndex(
                    OpenableColumns.SIZE
                );
                if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
                    size = cursor.getLong(sizeIndex);
                }

                int addedIndex = cursor.getColumnIndex(
                    MediaStore.Images.Media.DATE_ADDED
                );
                if (addedIndex >= 0 && !cursor.isNull(addedIndex)) {
                    added = cursor.getLong(addedIndex);
                }

                int widthIndex = cursor.getColumnIndex(
                    MediaStore.Images.Media.WIDTH
                );
                if (widthIndex >= 0 && !cursor.isNull(widthIndex)) {
                    width = cursor.getInt(widthIndex);
                }

                int heightIndex = cursor.getColumnIndex(
                    MediaStore.Images.Media.HEIGHT
                );
                if (heightIndex >= 0 && !cursor.isNull(heightIndex)) {
                    height = cursor.getInt(heightIndex);
                }

                if (!name.isEmpty() && added > 0L) {
                    String fingerprint =
                        name.toLowerCase(java.util.Locale.ROOT)
                            + "|" + size
                            + "|" + added
                            + "|" + width
                            + "|" + height;

                    String hash = sha256(fingerprint);
                    if (!hash.isEmpty()) {
                        return "android-meta:" + hash;
                    }
                }
            }
        } catch (Exception ignored) {
            // 部分厂商图库不开放全部 MediaStore 列；
            // 继续尝试从 URI 本身提取媒体数字 ID。
        }

        String raw = uri.toString();

        java.util.regex.Matcher matcher =
            java.util.regex.Pattern
                .compile(
                    "(?:images(?:%2F|/|%3A|:)?media(?:%2F|/)?|image(?:%3A|:))(\\d+)",
                    java.util.regex.Pattern.CASE_INSENSITIVE
                )
                .matcher(raw);

        if (matcher.find()) {
            return "android-media:" + matcher.group(1);
        }

        return "";
    }

    private String queryCreationDate(Uri uri) {
        ContentResolver resolver = getContext().getContentResolver();
        String[] projection = new String[] {
            MediaStore.Images.Media.DATE_ADDED
        };

        try (
            Cursor cursor = resolver.query(uri, projection, null, null, null)
        ) {
            if (cursor == null || !cursor.moveToFirst()) return "";

            int index = cursor.getColumnIndex(
                MediaStore.Images.Media.DATE_ADDED
            );
            if (index < 0 || cursor.isNull(index)) return "";

            long seconds = cursor.getLong(index);
            if (seconds <= 0L) return "";

            return java.time.Instant
                .ofEpochSecond(seconds)
                .toString();
        } catch (Exception ignored) {
            // 不用 DATE_MODIFIED 冒充创建日期；读不到就留空。
            return "";
        }
    }

    private String currentSourceDevice() {
        String manufacturer = String.valueOf(Build.MANUFACTURER).trim();
        String model = String.valueOf(Build.MODEL).trim();

        if (model.isEmpty()) return manufacturer;
        if (
            !manufacturer.isEmpty()
                && !model.toLowerCase(java.util.Locale.ROOT)
                    .startsWith(
                        manufacturer.toLowerCase(
                            java.util.Locale.ROOT
                        )
                    )
        ) {
            return manufacturer + " " + model;
        }
        return model;
    }

    @PluginMethod
    public void pickPhotos(PluginCall call) {
        /*
         * 使用系统图库入口，而不是 ACTION_OPEN_DOCUMENT 文件选择器。
         * 这样旧华为/安卓会回到已经验证过的图库多选界面。
         *
         * 原图长期读取不再依赖选择器本身的 persistable URI：
         * 当前版本已有 assetKey / mediaStoreId 映射和
         * canonical MediaStore URI 回退，继续由那条链负责恢复原图。
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
                    String assetKey = queryStableAssetKey(uri);
                    rememberPhotoUri(assetKey, uri);
                    photo.put("assetKey", assetKey);
                    photo.put("mediaStoreId", mediaStoreIdFromAssetKey(assetKey));
                    photo.put("thumbnail", thumbnail);
                    photo.put("width", info.width);
                    photo.put("height", info.height);
                    photo.put("filename", queryDisplayName(uri));
                    photo.put("creationDate", queryCreationDate(uri));
                    photo.put("sourceDevice", currentSourceDevice());
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
    public void exportRecordFile(PluginCall call) {
        String content = call.getString("content");
        String fileName = call.getString("fileName");

        if (content == null) content = "";
        if (fileName == null || fileName.trim().isEmpty()) {
            fileName = "snowlet-records.json";
        }

        // 只保留文件名，避免路径字符进入系统保存位置。
        fileName = fileName
            .replace("/", "_")
            .replace("\\", "_");

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, fileName);

        startActivityForResult(
            call,
            intent,
            "handleRecordFileCreateResult"
        );
    }

    @ActivityCallback
    private void handleRecordFileCreateResult(
        PluginCall call,
        @Nullable androidx.activity.result.ActivityResult result
    ) {
        if (call == null) return;

        if (
            result == null
                || result.getResultCode() != android.app.Activity.RESULT_OK
        ) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }

        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();

        if (uri == null) {
            call.reject("系统没有返回记录文件的保存位置。");
            return;
        }

        String content = call.getString("content");
        if (content == null) content = "";

        try (
            OutputStream output =
                getContext()
                    .getContentResolver()
                    .openOutputStream(uri, "wt")
        ) {
            if (output == null) {
                call.reject("无法打开记录文件的保存位置。");
                return;
            }

            output.write(content.getBytes(StandardCharsets.UTF_8));
            output.flush();

            JSObject response = new JSObject();
            response.put("cancelled", false);
            response.put("saved", true);
            response.put("uri", uri.toString());
            call.resolve(response);
        } catch (Exception error) {
            call.reject("记录文件没有保存成功。", error);
        }
    }


    private static class PhotoRef {
        final String rawUri;
        final String assetKey;
        final String mediaStoreId;

        PhotoRef(String rawUri, String assetKey, String mediaStoreId) {
            this.rawUri = rawUri == null ? "" : rawUri.trim();
            this.assetKey = assetKey == null ? "" : assetKey.trim();
            this.mediaStoreId = mediaStoreId == null ? "" : mediaStoreId.trim();
        }
    }

    private String mediaStoreIdFromAssetKey(String assetKey) {
        String value = assetKey == null ? "" : assetKey.trim();
        if (!value.startsWith("android-media:")) return "";
        String id = value.substring("android-media:".length()).trim();
        return id.matches("\\d+") ? id : "";
    }

    private String mediaStoreIdFromUri(String rawUri) {
        String value = rawUri == null ? "" : rawUri.trim();
        if (value.isEmpty()) return "";
        try {
            String decoded = Uri.decode(value);
            java.util.regex.Matcher matcher = java.util.regex.Pattern
                .compile("(?:images/media/|image:)(\\d+)$", java.util.regex.Pattern.CASE_INSENSITIVE)
                .matcher(decoded);
            if (matcher.find()) return matcher.group(1);
        } catch (Exception ignored) {}
        return "";
    }

    private Uri canonicalMediaStoreUri(String mediaStoreId) {
        String id = mediaStoreId == null ? "" : mediaStoreId.trim();
        if (!id.matches("\\d+")) return null;
        try {
            return ContentUris.withAppendedId(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                Long.parseLong(id)
            );
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean canReadPhotoUri(@Nullable Uri uri) {
        if (uri == null) return false;
        try (
            android.os.ParcelFileDescriptor descriptor = getContext()
                .getContentResolver()
                .openFileDescriptor(uri, "r")
        ) {
            return descriptor != null;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void rememberPhotoUri(String assetKey, Uri uri) {
        if (uri == null) return;

        android.content.SharedPreferences.Editor editor = getContext()
            .getSharedPreferences(PHOTO_URI_PREFS, android.content.Context.MODE_PRIVATE)
            .edit();

        String raw = uri.toString();
        String stable = assetKey == null ? "" : assetKey.trim();
        if (!stable.isEmpty()) editor.putString(stable, raw);

        String mediaId = mediaStoreIdFromAssetKey(stable);
        if (mediaId.isEmpty()) mediaId = mediaStoreIdFromUri(raw);
        if (!mediaId.isEmpty()) {
            editor.putString("android-media:" + mediaId, raw);
        }

        editor.apply();
    }

    private Uri mappedPhotoUri(PhotoRef ref) {
        if (ref == null) return null;

        android.content.SharedPreferences preferences = getContext()
            .getSharedPreferences(PHOTO_URI_PREFS, android.content.Context.MODE_PRIVATE);

        List<String> keys = new ArrayList<>();
        if (!ref.assetKey.isEmpty()) keys.add(ref.assetKey);

        String mediaId = ref.mediaStoreId;
        if (mediaId.isEmpty()) mediaId = mediaStoreIdFromAssetKey(ref.assetKey);
        if (mediaId.isEmpty()) mediaId = mediaStoreIdFromUri(ref.rawUri);
        if (!mediaId.isEmpty()) keys.add("android-media:" + mediaId);

        for (String key : keys) {
            String mapped = preferences.getString(key, "");
            if (mapped == null || mapped.trim().isEmpty()) continue;
            try {
                Uri candidate = Uri.parse(mapped);
                if (canReadPhotoUri(candidate)) return candidate;
            } catch (Exception ignored) {}
        }

        return null;
    }

    private Uri resolvePhotoUri(PhotoRef ref) {
        if (ref == null) return null;

        if (!ref.rawUri.isEmpty()) {
            try {
                Uri raw = Uri.parse(ref.rawUri);
                if (canReadPhotoUri(raw)) return raw;
            } catch (Exception ignored) {}
        }

        Uri mapped = mappedPhotoUri(ref);
        if (mapped != null) return mapped;

        String mediaId = ref.mediaStoreId;
        if (mediaId.isEmpty()) mediaId = mediaStoreIdFromAssetKey(ref.assetKey);
        if (mediaId.isEmpty()) mediaId = mediaStoreIdFromUri(ref.rawUri);

        Uri canonical = canonicalMediaStoreUri(mediaId);
        if (canReadPhotoUri(canonical)) return canonical;

        return null;
    }

    private String arrayString(JSArray array, int index) {
        if (array == null || index < 0 || index >= array.length()) return "";
        try {
            String value = array.getString(index);
            return value == null ? "" : value.trim();
        } catch (Exception ignored) {
            return "";
        }
    }

    @PluginMethod
    public void presentPhoto(PluginCall call) {
        List<PhotoRef> refs = new ArrayList<>();

        JSArray rawUris = call.getArray("uris");
        JSArray rawAssetKeys = call.getArray("assetKeys");
        JSArray rawMediaStoreIds = call.getArray("mediaStoreIds");

        int count = rawUris == null ? 0 : rawUris.length();
        if (rawAssetKeys != null) count = Math.max(count, rawAssetKeys.length());
        if (rawMediaStoreIds != null) count = Math.max(count, rawMediaStoreIds.length());

        for (int i = 0; i < count; i++) {
            String uri = arrayString(rawUris, i);
            String assetKey = arrayString(rawAssetKeys, i);
            String mediaStoreId = arrayString(rawMediaStoreIds, i);

            PhotoRef ref = new PhotoRef(uri, assetKey, mediaStoreId);
            if (!ref.rawUri.isEmpty() || !ref.assetKey.isEmpty() || !ref.mediaStoreId.isEmpty()) {
                refs.add(ref);
            }
        }

        // 兼容旧版只传单张照片的调用。
        if (refs.isEmpty()) {
            String rawUri = call.getString("uri");
            String assetKey = call.getString("assetKey");
            String mediaStoreId = call.getString("mediaStoreId");
            PhotoRef single = new PhotoRef(rawUri, assetKey, mediaStoreId);
            if (!single.rawUri.isEmpty() || !single.assetKey.isEmpty() || !single.mediaStoreId.isEmpty()) {
                refs.add(single);
            }
        }

        if (refs.isEmpty()) {
            call.reject("这组照片没有可用的系统索引。");
            return;
        }

        Integer requestedIndex = call.getInt("index");
        int initialIndex = requestedIndex == null ? 0 : requestedIndex;
        initialIndex = Math.max(0, Math.min(initialIndex, refs.size() - 1));

        final int safeInitialIndex = initialIndex;
        getActivity().runOnUiThread(() -> {
            try {
                showPhotoDialog(refs, safeInitialIndex);
                call.resolve();
            } catch (Exception error) {
                call.reject(
                    "原照片无法打开，可能已经被删除或权限已改变。",
                    error
                );
            }
        });
    }

    private void showPhotoDialog(List<PhotoRef> refs, int initialIndex) {
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

        TextView counter = new TextView(getActivity());
        counter.setTextColor(Color.argb(210, 255, 255, 255));
        counter.setTextSize(14f);
        counter.setGravity(Gravity.CENTER);
        counter.setPadding(dp(12), dp(6), dp(12), dp(6));
        counter.setBackgroundColor(Color.TRANSPARENT);
        counter.setIncludeFontPadding(false);

        Runnable showCurrentPhoto = () -> {
            Uri currentUri = resolvePhotoUri(refs.get(currentIndex[0]));
            image.resetForNewImage();
            image.loadIndexedPhoto(currentUri);
            String positionText =
                (currentIndex[0] + 1) + " / " + refs.size();
            image.setContentDescription("原图 " + positionText);
            counter.setText(positionText);
        };

        image.setOnSwipeListener(direction -> {
            if (direction < 0 && currentIndex[0] < refs.size() - 1) {
                currentIndex[0] += 1;
                showCurrentPhoto.run();
            } else if (direction > 0 && currentIndex[0] > 0) {
                currentIndex[0] -= 1;
                showCurrentPhoto.run();
            }
        });

        image.setOnLongPressListener(() ->
            shareIndexedPhoto(resolvePhotoUri(refs.get(currentIndex[0])))
        );

        FrameLayout.LayoutParams imageParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        root.addView(image, imageParams);

        FrameLayout.LayoutParams counterParams =
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
        counterParams.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        counterParams.bottomMargin = dp(22);
        root.addView(counter, counterParams);

        TextView close = new TextView(getActivity());
        close.setText("×");
        close.setTextColor(Color.argb(190, 255, 255, 255));
        close.setTextSize(27);
        close.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.NORMAL);
        close.setGravity(Gravity.CENTER);
        close.setIncludeFontPadding(false);
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
        if (uri == null) return;
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

        void loadIndexedPhoto(@Nullable Uri uri) {
            setImageDrawable(null);
            if (uri == null) return;

            // 先走 ImageView 自己的 URI 解码。部分旧华为图库 URI 会静默失败，
            // 因此 drawable 仍为空时再通过 ContentResolver 输入流解码。
            super.setImageURI(uri);

            if (getDrawable() == null) {
                try (
                    InputStream stream = getContext()
                        .getContentResolver()
                        .openInputStream(uri)
                ) {
                    if (stream != null) {
                        Bitmap bitmap = BitmapFactory.decodeStream(stream);
                        if (bitmap != null) setImageBitmap(bitmap);
                    }
                } catch (Exception ignored) {
                    // URI 已失去读取权限或原图已经不存在时保持黑底。
                }
            }

            post(this::resetToFit);
        }

        @Override
        public void setImageURI(@Nullable Uri uri) {
            loadIndexedPhoto(uri);
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
