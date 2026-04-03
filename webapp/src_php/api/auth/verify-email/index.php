<?php
require_once dirname(__DIR__, 3) . '/lib/auth.php';

$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('POST');
auth_start_session($config);

$payload = auth_read_json_body();
$token = trim((string) ($payload['token'] ?? ''));
if ($token === '') {
    php_backend_error(400, 'token is required.');
}

$pdo = auth_get_pdo($config);
$tokenHash = auth_token_hash($token);

$stmt = $pdo->prepare('SELECT * FROM email_verification_tokens WHERE token_hash = :token_hash LIMIT 1');
$stmt->execute(['token_hash' => $tokenHash]);
$row = $stmt->fetch();
if (!$row) {
    php_backend_error(400, 'Invalid verification token.');
}
if (!empty($row['used_at'])) {
    php_backend_error(400, 'Verification token has already been used.');
}
if (strtotime((string) $row['expires_at']) < time()) {
    php_backend_error(400, 'Verification token has expired.');
}

$pdo->prepare('UPDATE email_verification_tokens SET used_at = NOW() WHERE id = :id')->execute(['id' => $row['id']]);
$pdo->prepare("UPDATE users SET status = 'active', email_verified_at = NOW(), updated_at = NOW() WHERE id = :id")->execute(['id' => $row['user_id']]);

php_backend_json_response(200, [
    'ok' => true,
    'message' => 'Email verified. You can now log in.',
]);
