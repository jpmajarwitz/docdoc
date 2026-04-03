<?php
require_once dirname(__DIR__, 3) . '/lib/auth.php';

$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('POST');
auth_start_session($config);

$payload = auth_read_json_body();
$email = trim((string) ($payload['email'] ?? ''));
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    php_backend_error(400, 'A valid email is required.');
}

$pdo = auth_get_pdo($config);
$user = auth_get_user_by_email($pdo, auth_normalize_email($email));
$token = null;
if ($user && ($user['status'] ?? '') === 'active') {
    $token = auth_generate_token();
    $tokenHash = auth_token_hash($token);
    $expiresAt = date('Y-m-d H:i:s', time() + 1800);

    $stmt = $pdo->prepare('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at) VALUES (:user_id, :token_hash, :expires_at, NOW())');
    $stmt->execute([
        'user_id' => $user['id'],
        'token_hash' => $tokenHash,
        'expires_at' => $expiresAt,
    ]);
}

php_backend_json_response(200, [
    'ok' => true,
    'message' => 'If the email exists, reset instructions were created.',
    'resetToken' => $token,
]);
