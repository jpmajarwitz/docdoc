<?php
require_once dirname(__DIR__, 3) . '/lib/auth.php';

$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('POST');
auth_start_session($config);

$payload = auth_read_json_body();
$email = trim((string) ($payload['email'] ?? ''));
$password = (string) ($payload['password'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '') {
    php_backend_error(400, 'Valid email and password are required.');
}

$pdo = auth_get_pdo($config);
$user = auth_get_user_by_email($pdo, auth_normalize_email($email));
if (!$user || !password_verify($password, $user['password_hash'])) {
    php_backend_error(401, 'Invalid credentials.');
}

if (($user['status'] ?? '') !== 'active') {
    php_backend_error(403, 'Account is not active. Verify your email first.');
}

$_SESSION['auth_user_id'] = (int) $user['id'];
$_SESSION['auth_email'] = $user['email'];
$_SESSION['auth_logged_in_at'] = time();

try {
    $pdo->prepare('UPDATE users SET last_login_at = NOW() WHERE id = :id')->execute(['id' => $user['id']]);
} catch (Throwable $exception) {
    php_backend_log('auth.login.last_login_update_failed', [
        'user_id' => $user['id'],
        'error' => $exception->getMessage(),
    ]);
}

php_backend_json_response(200, [
    'ok' => true,
    'user' => auth_public_user($user),
]);
