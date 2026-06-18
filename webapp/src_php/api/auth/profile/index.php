<?php
require_once dirname(__DIR__, 3) . '/lib/auth.php';

$config = php_backend_load_config();
php_backend_apply_cors($config);
auth_start_session($config);

if ($_SERVER['REQUEST_METHOD'] !== 'GET' && $_SERVER['REQUEST_METHOD'] !== 'POST') {
    php_backend_error(405, 'Use GET or POST for this endpoint.');
}

if (empty($_SESSION['auth_user_id'])) {
    php_backend_error(401, 'Session expired. Please login again.');
}

$pdo = auth_get_pdo($config);
$sessionRecord = auth_get_active_session_record($pdo, session_id());
if (!$sessionRecord || (int) $sessionRecord['user_id'] !== (int) $_SESSION['auth_user_id'] || auth_session_record_is_expired($sessionRecord)) {
    auth_revoke_session_record($pdo, session_id());
    auth_clear_session_state();
    php_backend_error(401, 'Session expired. Please login again.');
}
auth_touch_session_record($pdo, session_id(), auth_session_timeout_seconds($config));

$userId = (int) $_SESSION['auth_user_id'];
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    php_backend_json_response(200, [
        'ok' => true,
        'settings' => auth_get_user_profile($pdo, $userId),
    ]);
}

$payload = auth_read_json_body();
$settings = $payload['settings'] ?? [];
$saved = auth_save_user_profile($pdo, $userId, $settings);

php_backend_json_response(200, [
    'ok' => true,
    'settings' => $saved,
]);
