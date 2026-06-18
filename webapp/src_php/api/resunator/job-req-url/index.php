<?php
require_once dirname(__DIR__, 3) . '/lib/auth.php';
$config = php_backend_load_config();
php_backend_apply_cors($config);
php_backend_require_method('POST');
auth_require_active_session($config);

$payload = json_decode(file_get_contents('php://input') ?: '{}', true);
if (!is_array($payload)) {
    php_backend_error(400, 'Invalid JSON payload.');
}

$url = trim((string) ($payload['url'] ?? ''));
if ($url === '') {
    php_backend_error(400, 'URL is required.');
}

function resunator_url_host_is_safe($host)
{
    if ($host === '' || strlen($host) > 253) {
        return false;
    }
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        return resunator_ip_is_public($host);
    }

    $records = @dns_get_record($host, DNS_A + DNS_AAAA);
    if (!is_array($records) || count($records) === 0) {
        return false;
    }

    foreach ($records as $record) {
        $ip = (string) ($record['ip'] ?? $record['ipv6'] ?? '');
        if ($ip === '' || !resunator_ip_is_public($ip)) {
            return false;
        }
    }

    return true;
}

function resunator_ip_is_public($ip)
{
    return filter_var(
        $ip,
        FILTER_VALIDATE_IP,
        FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
    ) !== false;
}

function resunator_validate_url($url)
{
    $parts = parse_url($url);
    if (!is_array($parts) || strtolower((string) ($parts['scheme'] ?? '')) !== 'https') {
        php_backend_error(400, 'Only https job requisition URLs are allowed.');
    }

    $host = strtolower((string) ($parts['host'] ?? ''));
    if (!resunator_url_host_is_safe($host)) {
        php_backend_error(400, 'The job requisition URL host is not allowed.');
    }
}

function resunator_fetch_url($url, $config)
{
    if (!function_exists('curl_init')) {
        php_backend_error(500, 'PHP cURL extension is required to fetch job requisition URLs.');
    }

    $maxBytes = (int) ($config['resunator_job_req_max_bytes'] ?? 1048576);
    $timeout = (int) ($config['resunator_job_req_timeout_seconds'] ?? 12);
    $maxRedirects = (int) ($config['resunator_job_req_max_redirects'] ?? 3);

    resunator_validate_url($url);
    $currentUrl = $url;

    for ($redirect = 0; $redirect <= $maxRedirects; $redirect++) {
        $body = '';
        $headers = [];
        $ch = curl_init($currentUrl);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_CONNECTTIMEOUT => min($timeout, 5),
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_USERAGENT => 'A-Ideation RESUnator JobReqFetcher/1.0',
            CURLOPT_HEADERFUNCTION => function ($curl, $headerLine) use (&$headers) {
                $length = strlen($headerLine);
                $parts = explode(':', $headerLine, 2);
                if (count($parts) === 2) {
                    $headers[strtolower(trim($parts[0]))] = trim($parts[1]);
                }
                return $length;
            },
            CURLOPT_WRITEFUNCTION => function ($curl, $chunk) use (&$body, $maxBytes) {
                $body .= $chunk;
                if (strlen($body) > $maxBytes) {
                    return 0;
                }
                return strlen($chunk);
            },
        ]);

        $ok = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $effectiveUrl = (string) curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
        $error = curl_error($ch);
        curl_close($ch);

        if (!$ok) {
            php_backend_error(502, $error !== '' ? 'Unable to fetch job requisition URL: ' . $error : 'Unable to fetch job requisition URL.');
        }

        if (in_array($status, [301, 302, 303, 307, 308], true)) {
            $location = (string) ($headers['location'] ?? '');
            if ($location === '') {
                php_backend_error(502, 'Job requisition URL redirected without a Location header.');
            }
            $currentUrl = resunator_resolve_url($effectiveUrl ?: $currentUrl, $location);
            resunator_validate_url($currentUrl);
            continue;
        }

        if ($status < 200 || $status >= 300) {
            php_backend_error(502, 'Job requisition URL returned HTTP status ' . $status . '.');
        }

        $contentType = strtolower((string) ($headers['content-type'] ?? ''));
        $allowedContentTypes = ['text/html', 'text/plain', 'application/json'];
        $contentTypeAllowed = false;
        foreach ($allowedContentTypes as $allowedContentType) {
            if (strpos($contentType, $allowedContentType) !== false) {
                $contentTypeAllowed = true;
                break;
            }
        }
        if (!$contentTypeAllowed && $contentType !== '') {
            php_backend_error(415, 'Only HTML, plain text, or JSON job requisition URLs can be parsed.');
        }

        return [$body, $contentType, $effectiveUrl ?: $currentUrl];
    }

    php_backend_error(400, 'Too many redirects while fetching the job requisition URL.');
}

function resunator_resolve_url($baseUrl, $location)
{
    if (parse_url($location, PHP_URL_SCHEME)) {
        return $location;
    }

    $base = parse_url($baseUrl);
    if (!is_array($base)) {
        return $location;
    }

    $scheme = (string) ($base['scheme'] ?? 'https');
    $host = (string) ($base['host'] ?? '');
    $port = isset($base['port']) ? ':' . $base['port'] : '';
    if (strpos($location, '//') === 0) {
        return $scheme . ':' . $location;
    }
    if (strpos($location, '/') === 0) {
        return $scheme . '://' . $host . $port . $location;
    }

    $path = (string) ($base['path'] ?? '/');
    $dir = preg_replace('#/[^/]*$#', '/', $path);
    return $scheme . '://' . $host . $port . $dir . $location;
}

function resunator_extract_json_ld_job($html)
{
    $jobs = [];
    if (!preg_match_all('#<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>#is', $html, $matches)) {
        return null;
    }

    foreach ($matches[1] as $jsonText) {
        $decoded = json_decode(html_entity_decode(trim($jsonText), ENT_QUOTES | ENT_HTML5), true);
        resunator_collect_job_postings($decoded, $jobs);
    }

    return $jobs[0] ?? null;
}

function resunator_collect_job_postings($node, &$jobs)
{
    if (!is_array($node)) {
        return;
    }

    $type = $node['@type'] ?? '';
    if (is_array($type)) {
        $isJob = in_array('JobPosting', $type, true);
    } else {
        $isJob = strtolower((string) $type) === 'jobposting';
    }
    if ($isJob) {
        $jobs[] = $node;
    }

    foreach ($node as $value) {
        if (is_array($value)) {
            resunator_collect_job_postings($value, $jobs);
        }
    }
}

function resunator_html_to_text($html)
{
    $html = preg_replace('#<script\b[^>]*>.*?</script>#is', ' ', $html);
    $html = preg_replace('#<style\b[^>]*>.*?</style>#is', ' ', $html);
    $html = preg_replace('#<(br|p|div|li|section|article|h[1-6])\b[^>]*>#i', "\n", $html);
    $text = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $text = preg_replace('/[ \t]+/', ' ', $text);
    $text = preg_replace('/\n\s*\n+/', "\n\n", $text);
    return trim($text);
}

function resunator_value_to_text($value)
{
    if (is_string($value)) {
        return trim(resunator_html_to_text($value));
    }
    if (is_numeric($value)) {
        return (string) $value;
    }
    if (is_array($value)) {
        $parts = [];
        foreach ($value as $item) {
            $text = resunator_value_to_text($item);
            if ($text !== '') {
                $parts[] = $text;
            }
        }
        return implode(', ', array_unique($parts));
    }
    return '';
}

function resunator_job_from_json_ld($job, $fallbackText)
{
    $org = $job['hiringOrganization'] ?? [];
    $location = $job['jobLocation'] ?? [];
    $comp = $job['baseSalary'] ?? [];

    return [
        'company_name' => resunator_value_to_text(is_array($org) ? ($org['name'] ?? '') : $org),
        'job_location' => resunator_value_to_text($location),
        'job_title' => resunator_value_to_text($job['title'] ?? ''),
        'job_description' => resunator_value_to_text($job['description'] ?? $fallbackText),
        'company_description' => resunator_value_to_text($job['industry'] ?? ''),
        'compensation' => resunator_value_to_text($comp),
    ];
}

function resunator_first_matching_line($lines, $patterns)
{
    foreach ($lines as $line) {
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $line)) {
                return trim($line);
            }
        }
    }
    return '';
}

function resunator_parse_job_req($body, $contentType, $sourceUrl)
{
    $jsonLdJob = strpos($contentType, 'text/html') !== false ? resunator_extract_json_ld_job($body) : null;
    $text = strpos($contentType, 'text/html') !== false ? resunator_html_to_text($body) : trim($body);
    if (strpos($contentType, 'application/json') !== false) {
        $decoded = json_decode($body, true);
        $jobs = [];
        resunator_collect_job_postings($decoded, $jobs);
        if (!empty($jobs)) {
            $jsonLdJob = $jobs[0];
        }
        $text = $text !== '' ? $text : resunator_value_to_text($decoded);
    }

    $lines = array_values(array_filter(array_map('trim', preg_split('/\R+/', $text))));
    $job = $jsonLdJob ? resunator_job_from_json_ld($jsonLdJob, $text) : [
        'company_name' => resunator_first_matching_line($lines, ['/company\s*[:\-]/i', '/employer\s*[:\-]/i']),
        'job_location' => resunator_first_matching_line($lines, ['/location\s*[:\-]/i', '/remote/i', '/hybrid/i']),
        'job_title' => $lines[0] ?? '',
        'job_description' => $text,
        'company_description' => resunator_first_matching_line($lines, ['/about\s+(us|the company)/i', '/company description/i']),
        'compensation' => resunator_first_matching_line($lines, ['/salary/i', '/compensation/i', '/\$\s?\d/']),
    ];

    $maxFieldLength = 20000;
    foreach ($job as $key => $value) {
        $job[$key] = mb_substr(trim((string) $value), 0, $maxFieldLength);
    }
    $job['source_url'] = $sourceUrl;
    $job['retrieved_at'] = gmdate(DateTimeInterface::ATOM);

    return $job;
}

[$body, $contentType, $effectiveUrl] = resunator_fetch_url($url, $config);
$jobReq = resunator_parse_job_req($body, $contentType, $effectiveUrl);

php_backend_json_response(200, [
    'ok' => true,
    'job_req' => $jobReq,
]);
