<?php
require_once dirname(__DIR__, 3) . '/lib/auth.php';

$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('POST');
auth_start_session($config);

$payload = auth_read_json_body();
$token = trim((string) ($payload['token'] ?? ''));
$newPassword = (string) ($payload['newPassword'] ?? '');
if ($token === '') {
    php_backend_error(400, 'token is required.');
}
auth_validate_password($newPassword);

$pdo = auth_get_pdo($config);
$stmt = $pdo->prepare('SELECT * FROM password_reset_tokens WHERE token_hash = :token_hash LIMIT 1');
$stmt->execute(['token_hash' => auth_token_hash($token)]);
$row = $stmt->fetch();
if (!$row) {
    php_backend_error(400, 'Invalid reset token.');
}
if (!empty($row['used_at'])) {
    php_backend_error(400, 'Reset token has already been used.');
}
if (strtotime((string) $row['expires_at']) < time()) {
    php_backend_error(400, 'Reset token has expired.');
}

$passwordHash = password_hash($newPassword, PASSWORD_DEFAULT);
try {
    $pdo->prepare('UPDATE users SET password_hash = :password_hash WHERE id = :id')->execute([
        'password_hash' => $passwordHash,
        'id' => $row['user_id'],
    ]);
    $pdo->prepare('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = :id')->execute(['id' => $row['id']]);
} catch (Throwable $exception) {
    php_backend_error(500, 'Password reset failed: ' . $exception->getMessage());
}

php_backend_json_response(200, [
    'ok' => true,
    'message' => 'Password updated.',
]);
