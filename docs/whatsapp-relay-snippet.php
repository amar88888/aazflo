<?php
/**
 * Relay WhatsApp → Aazflo Inbox
 * Pasang di nottinite.com: Code Snippets → Add New → tampal kod di bawah
 * (TANPA baris "<?php" di atas) → "Run snippet everywhere" → Save & Activate.
 *
 * Apa ia buat:
 *  - Setiap kali Meta hantar webhook ke plugin WooCommerce WhatsApp Notify
 *    (/wp-json/wcwn/v1/webhook), salinan dihantar ke Aazflo Inbox.
 *  - Plugin TETAP proses macam biasa. Webhook dalam Meta TAK diubah.
 *  - Hantar tanpa tunggu (blocking=false) — plugin & Meta tak jadi lambat.
 *  - Snippet kekal walaupun plugin di-update (bukan edit fail plugin).
 *
 * GANTI nilai AAZFLO_RELAY_URL dengan "Relay URL" dari Aazflo → Settings → WhatsApp.
 * URL tu RAHSIA — jangan kongsi.
 */

if (!defined('AAZFLO_RELAY_URL')) {
    define('AAZFLO_RELAY_URL', 'https://aazflo.com/api/whatsapp/webhook?k=GANTI_DENGAN_KEY');
}

add_filter('rest_pre_dispatch', function ($result, $server, $request) {
    if ($request->get_method() !== 'POST' || $request->get_route() !== '/wcwn/v1/webhook') {
        return $result;
    }
    $body = $request->get_body();
    if ($body === '' || strpos(AAZFLO_RELAY_URL, 'GANTI_DENGAN_KEY') !== false) {
        return $result;
    }
    wp_remote_post(AAZFLO_RELAY_URL, array(
        'body'     => $body,
        'headers'  => array(
            'Content-Type'        => 'application/json',
            'X-Hub-Signature-256' => (string) $request->get_header('x_hub_signature_256'),
            'X-Relay-From'        => 'nottinite',
        ),
        'timeout'  => 2,
        'blocking' => false,
    ));
    return $result; // biar plugin terus proses webhook macam biasa
}, 1, 3);
