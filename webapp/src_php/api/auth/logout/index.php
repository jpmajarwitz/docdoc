<?php
require_once dirname(__DIR__, 3) . '/lib/auth.php';

$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('POST');
auth_start_session($config);

$pdo = auth_get_pdo($config);
auth_revoke_session_record($pdo, session_id());
auth_clear_session_state();

php_backend_json_response(200, ['ok' => true]);
