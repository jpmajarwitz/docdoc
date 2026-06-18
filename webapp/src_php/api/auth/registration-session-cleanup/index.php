<?php
require_once dirname(__DIR__, 3) . '/lib/auth.php';
$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('POST');
$user = auth_require_active_session($config);
if (strtolower((string) ($user['user_type'] ?? 'regular')) !== 'registration_admin') php_backend_error(403, 'Registration admin access is required.');
$payload = auth_read_json_body();
$asOfDate = trim((string) ($payload['asOfDate'] ?? ''));
if ($asOfDate === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $asOfDate)) {
  php_backend_error(400, 'A valid asOfDate (YYYY-MM-DD) is required.');
}
$asOfDateTime = $asOfDate . ' 23:59:59';
$pdo = auth_get_pdo($config);
$stmt = $pdo->prepare("DELETE FROM user_sessions WHERE session_status = 'terminated' AND revoked_at IS NOT NULL AND revoked_at < :as_of");
$stmt->execute(['as_of' => $asOfDateTime]);
php_backend_json_response(200, ['ok'=>true,'message'=>'Terminated sessions deleted.','deletedCount'=>$stmt->rowCount()]);
