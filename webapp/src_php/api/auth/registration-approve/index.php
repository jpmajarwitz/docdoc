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
$durationDays = (int) ($payload['durationDays'] ?? 30);
if ($contactId < 1) {
    php_backend_error(400, 'A valid contactId is required.');
}
if ($durationDays < 1) {
    php_backend_error(400, 'A valid durationDays is required.');
}

$pdo = auth_get_pdo($config);
auth_ensure_contact_columns($pdo);

$contactStmt = $pdo->prepare("SELECT email, first_name, last_name FROM contact WHERE id = :id LIMIT 1");
$contactStmt->execute(['id' => $contactId]);
$contact = $contactStmt->fetch() ?: null;
if (!$contact) {
    php_backend_error(404, 'Contact request not found.');
}

$stmt = $pdo->prepare("UPDATE contact SET `access` = 'approved', duration = :duration, updated_at = UTC_TIMESTAMP() WHERE id = :id");
$stmt->execute(['id' => $contactId, 'duration' => $durationDays]);
if ($stmt->rowCount() < 1) {
    php_backend_error(404, 'Contact request not found.');
}

$appUrl = auth_app_base_url($config) . '/index-ai.html';
$subject = 'A-Ideation trial access approved';
$htmlBody = sprintf(
    '<p>You have been approved for a %d day trial for <a href="%s">A-Ideation</a>.</p>',
    $durationDays,
    htmlspecialchars($appUrl, ENT_QUOTES)
);
$textBody = sprintf(
    'You have been approved for a %d day trial for A-Ideation. Access here: %s',
    $durationDays,
    $appUrl
);
$toName = trim((string) (($contact['first_name'] ?? '') . ' ' . ($contact['last_name'] ?? '')));
$emailDispatch = auth_send_email($config, (string) $contact['email'], $toName, $subject, $htmlBody, $textBody);

php_backend_json_response(200, [
    'ok' => true,
    'message' => 'Access request approved successfully.',
    'approvalEmailSent' => !empty($emailDispatch['sent']),
]);
