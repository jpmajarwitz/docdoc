<?php
require_once dirname(__DIR__, 3) . '/lib/auth.php';

$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('POST');
auth_start_session($config);

$payload = auth_read_json_body();
$firstName = trim((string) ($payload['firstName'] ?? ''));
$lastName = trim((string) ($payload['lastName'] ?? ''));
$phoneNumber = trim((string) ($payload['phoneNumber'] ?? ''));
$email = trim((string) ($payload['email'] ?? ''));
$jobTitle = trim((string) ($payload['jobTitle'] ?? ''));

if ($firstName === '' || $lastName === '' || $phoneNumber === '' || $jobTitle === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    php_backend_error(400, 'First name, last name, phone number, job title, and a valid email are required.');
}

$pdo = auth_get_pdo($config);
auth_ensure_contact_columns($pdo);
$emailNormalized = auth_normalize_email($email);

try {
    $pdo->beginTransaction();
    auth_upsert_contact_request($pdo, [
        'first_name' => $firstName,
        'last_name' => $lastName,
        'phone_number' => $phoneNumber,
        'email' => $email,
        'email_normalized' => $emailNormalized,
        'job_title' => $jobTitle,
    ]);
    $savedContact = auth_get_contact_by_email($pdo, $emailNormalized);
    if (!$savedContact) {
        throw new RuntimeException('Contact request record was not found after save.');
    }
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    php_backend_error(500, 'Unable to save contact request: ' . $e->getMessage());
}

$subject = 'A-Ideation access request';
$htmlBody = sprintf(
    '<p>A-Ideation access request submitted. You will receive an approval email shortly.</p><ul><li>First name: %s</li><li>Last name: %s</li><li>Phone: %s</li><li>Email: %s</li><li>Job title: %s</li></ul>',
    htmlspecialchars($firstName, ENT_QUOTES),
    htmlspecialchars($lastName, ENT_QUOTES),
    htmlspecialchars($phoneNumber, ENT_QUOTES),
    htmlspecialchars($email, ENT_QUOTES),
    htmlspecialchars($jobTitle, ENT_QUOTES)
);
$textBody = "A-Ideation access request submitted. You will receive an approval email shortly.\n"
    . "First name: {$firstName}\n"
    . "Last name: {$lastName}\n"
    . "Phone: {$phoneNumber}\n"
    . "Email: {$email}\n"
    . "Job title: {$jobTitle}";

$mailDispatch = auth_send_email($config, 'contact@enddne.com', 'A-Ideation Contact', $subject, $htmlBody, $textBody);

php_backend_json_response(200, [
    'ok' => true,
    'message' => 'A-Ideation access request submitted. You will receive an approval email shortly.',
    'emailSent' => !empty($mailDispatch['sent']),
]);
