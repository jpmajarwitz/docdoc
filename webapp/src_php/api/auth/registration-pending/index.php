<?php
require_once dirname(__DIR__, 3) . '/lib/auth.php';

$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('GET');

$user = auth_require_active_session($config);
if (strtolower((string) ($user['user_type'] ?? 'regular')) !== 'registration_admin') {
    php_backend_error(403, 'Registration admin access is required.');
}

$pdo = auth_get_pdo($config);
auth_ensure_contact_columns($pdo);

$stmt = $pdo->query("SELECT id, first_name, last_name, phone_number, email, job_title, `access`, created_at, updated_at FROM contact WHERE LOWER(`access`) = 'pending' ORDER BY created_at DESC");
$rows = $stmt->fetchAll() ?: [];

php_backend_json_response(200, [
    'ok' => true,
    'items' => $rows,
]);
