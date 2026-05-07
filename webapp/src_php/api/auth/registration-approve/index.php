<?php
require_once dirname(__DIR__, 3) . '/lib/auth.php';

$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('POST');

$user = auth_require_active_session($config);
if (strtolower((string) ($user['user_type'] ?? 'regular')) !== 'registration_admin') {
    php_backend_error(403, 'Registration admin access is required.');
}

$payload = auth_read_json_body();
$contactId = (int) ($payload['contactId'] ?? 0);
if ($contactId < 1) {
    php_backend_error(400, 'A valid contactId is required.');
}

$pdo = auth_get_pdo($config);
auth_ensure_contact_columns($pdo);

$stmt = $pdo->prepare("UPDATE contact SET `access` = 'approved', updated_at = UTC_TIMESTAMP() WHERE id = :id");
$stmt->execute(['id' => $contactId]);
if ($stmt->rowCount() < 1) {
    php_backend_error(404, 'Contact request not found.');
}

php_backend_json_response(200, ['ok' => true, 'message' => 'Access request approved successfully.']);
