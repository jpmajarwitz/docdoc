<?php
require_once dirname(__DIR__, 3) . '/lib/auth.php';
$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('POST');
$user = auth_require_active_session($config);
if (strtolower((string) ($user['user_type'] ?? 'regular')) !== 'registration_admin') php_backend_error(403, 'Registration admin access is required.');
$payload = auth_read_json_body();
$first=trim((string)($payload['firstName']??''));
$last=trim((string)($payload['lastName']??''));
$phone=trim((string)($payload['phoneNumber']??''));
$email=trim((string)($payload['email']??''));
$job=trim((string)($payload['jobTitle']??''));
if($first===''||$last===''||$phone===''||!filter_var($email,FILTER_VALIDATE_EMAIL)) php_backend_error(400,'First name, last name, phone number, and a valid email are required.');
$pdo=auth_get_pdo($config);
auth_ensure_contact_columns($pdo);
auth_upsert_contact_request($pdo,['first_name'=>$first,'last_name'=>$last,'phone_number'=>$phone,'email'=>$email,'email_normalized'=>auth_normalize_email($email),'job_title'=>$job]);
php_backend_json_response(200,['ok'=>true,'message'=>'Contact created successfully.']);
