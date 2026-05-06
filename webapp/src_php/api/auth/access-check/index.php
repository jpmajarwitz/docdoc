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
auth_ensure_user_trial_columns($pdo);
auth_ensure_contact_columns($pdo);
$emailNormalized = auth_normalize_email($email);
$contact = auth_get_contact_by_email($pdo, $emailNormalized);
$user = auth_get_user_by_email($pdo, $emailNormalized);

if (!$contact) {
    php_backend_json_response(200, [
        'ok' => true,
        'mode' => 'contact',
        'email' => $email,
    ]);
}

$access = strtolower((string) ($contact['access'] ?? 'pending'));
if ($access !== 'approved') {
    php_backend_json_response(200, [
        'ok' => true,
        'mode' => 'pending',
        'email' => $email,
        'message' => 'your contact information has been received and is being processed you will be notified at ' . $email . ' when registration is approved.'
    ]);
}

if (!$user) {
    php_backend_json_response(200, [
        'ok' => true,
        'mode' => 'register',
        'email' => $email,
    ]);
}

if (($user['status'] ?? '') === 'active') {
    php_backend_json_response(200, [
        'ok' => true,
        'mode' => 'login',
        'email' => $email,
    ]);
}

php_backend_json_response(200, [
    'ok' => true,
    'mode' => 'pending',
    'email' => $email,
    'message' => 'your contact information has been received and is being processed you will be notified at ' . $email . ' when registration is approved.'
]);
