<?php
require_once dirname(__DIR__, 3) . '/lib/auth.php';
$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('GET');
$user = auth_require_active_session($config);
if (strtolower((string) ($user['user_type'] ?? 'regular')) !== 'registration_admin') php_backend_error(403, 'Registration admin access is required.');
$pdo = auth_get_pdo($config);
auth_ensure_user_trial_columns($pdo);
$stmt = $pdo->query("SELECT id,email,display_name,status,account_type,trial_period_days,trial_start_at FROM users ORDER BY email ASC");
$rows = $stmt->fetchAll() ?: [];
$active = array_values(array_filter($rows, function ($r) {
    return strtolower((string) ($r['status'] ?? '')) === 'active';
}));
$inactive = array_values(array_filter($rows, function ($r) {
    return strtolower((string) ($r['status'] ?? '')) !== 'active';
}));
php_backend_json_response(200,['ok'=>true,'activeUsers'=>$active,'inactiveUsers'=>$inactive]);
