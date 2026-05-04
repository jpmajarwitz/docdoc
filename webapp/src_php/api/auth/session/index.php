<?php
require_once dirname(__DIR__, 3) . '/lib/auth.php';

$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('GET');
auth_start_session($config);

if (empty($_SESSION['auth_user_id'])) {
    php_backend_json_response(200, ['authenticated' => false]);
}

$pdo = auth_get_pdo($config);
auth_ensure_user_trial_columns($pdo);
$sessionRecord = auth_get_active_session_record($pdo, session_id());
if (!$sessionRecord || (int) $sessionRecord['user_id'] !== (int) $_SESSION['auth_user_id'] || auth_session_record_is_expired($sessionRecord)) {
    auth_revoke_session_record($pdo, session_id());
    auth_clear_session_state();
    php_backend_json_response(200, ['authenticated' => false]);
}

auth_touch_session_record($pdo, session_id(), auth_session_timeout_seconds($config));
$user = auth_get_user_by_id($pdo, (int) $_SESSION['auth_user_id']);
if (!$user || ($user['status'] ?? '') !== 'active') {
    auth_revoke_session_record($pdo, session_id());
    auth_clear_session_state();
    php_backend_json_response(200, ['authenticated' => false]);
}
if (!auth_user_trial_is_active($user)) {
    auth_revoke_session_record($pdo, session_id());
    auth_clear_session_state();
    php_backend_json_response(200, ['authenticated' => false, 'trialExpired' => true, 'message' => 'Trial period has ended.']);
}

php_backend_json_response(200, [
    'authenticated' => true,
    'user' => auth_public_user($user),
]);
