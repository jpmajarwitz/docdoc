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
$user = auth_get_user_by_id($pdo, (int) $_SESSION['auth_user_id']);
if (!$user || ($user['status'] ?? '') !== 'active') {
    $_SESSION = [];
    session_destroy();
    php_backend_json_response(200, ['authenticated' => false]);
}

php_backend_json_response(200, [
    'authenticated' => true,
    'user' => auth_public_user($user),
]);
