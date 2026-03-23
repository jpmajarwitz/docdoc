<?php
require_once dirname(__DIR__, 2) . '/lib/bootstrap.php';
$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('GET');
php_backend_json_response(200, ['status' => 'ok']);
