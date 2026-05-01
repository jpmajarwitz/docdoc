<?php
require_once dirname(__DIR__, 3) . '/lib/auth.php';

$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('POST');
auth_start_session($config);

$payload = auth_read_json_body();
$email = trim((string) ($payload['email'] ?? ''));
$password = (string) ($payload['password'] ?? '');
$displayName = trim((string) ($payload['displayName'] ?? ''));

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    php_backend_error(400, 'A valid email is required.');
}
auth_validate_password($password);

$emailNormalized = auth_normalize_email($email);
$pdo = auth_get_pdo($config);
$existing = auth_get_user_by_email($pdo, $emailNormalized);
if ($existing) {
    php_backend_error(409, 'An account with that email already exists.');
}

$passwordHash = password_hash($password, PASSWORD_DEFAULT);
$status = 'pending_verification';

try {
    $stmt = $pdo->prepare('INSERT INTO users (email, email_normalized, password_hash, display_name, status) VALUES (:email, :email_normalized, :password_hash, :display_name, :status)');
    $stmt->execute([
        'email' => $email,
        'email_normalized' => $emailNormalized,
        'password_hash' => $passwordHash,
        'display_name' => $displayName,
        'status' => $status,
    ]);
    $userId = (int) $pdo->lastInsertId();

    $token = auth_generate_token();
    $tokenHash = auth_token_hash($token);
    $expiresAt = date('Y-m-d H:i:s', time() + 86400);

    $tokenStmt = $pdo->prepare('INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES (:user_id, :token_hash, :expires_at)');
    $tokenStmt->execute([
        'user_id' => $userId,
        'token_hash' => $tokenHash,
        'expires_at' => $expiresAt,
    ]);

    auth_initialize_user_profile($pdo, $userId);
} catch (Throwable $exception) {
    php_backend_error(500, 'Registration failed: ' . $exception->getMessage());
}

$emailDispatch = auth_send_verification_email($config, $email, $displayName, $token);

$response = [
    'ok' => true,
    'message' => 'Registration successful. Verify your email to activate account.',
    'verificationEmailSent' => !empty($emailDispatch['sent']),
];
if (auth_should_return_tokens($config)) {
    $response['verificationToken'] = $token;
}
if (empty($emailDispatch['sent'])) {
    $response['verificationEmailError'] = $emailDispatch['error'] ?? 'Unable to send verification email from the server.';
}

php_backend_json_response(201, $response);
