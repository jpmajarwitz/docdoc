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

    try {
        $stmt = $pdo->prepare('INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (:user_id, :token_hash, :expires_at)');
        $stmt->execute([
            'user_id' => $user['id'],
            'token_hash' => $tokenHash,
            'expires_at' => $expiresAt,
        ]);

        auth_send_reset_email($config, $user['email'], (string) ($user['display_name'] ?? ''), $token);
    } catch (Throwable $exception) {
        php_backend_error(500, 'Password reset request failed: ' . $exception->getMessage());
    }
}

$response = [
    'ok' => true,
    'message' => 'If the email exists, reset instructions were created.',
];
if ($token && auth_should_return_tokens($config)) {
    $response['resetToken'] = $token;
}

php_backend_json_response(200, $response);
