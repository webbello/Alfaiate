import { orderWhatsapp } from '../config';
import { whatsappOrderService } from './whatsapp-service';
import type { OrderService } from './types';

/**
 * The one place that decides how an order is handled. Today: prepare a WhatsApp message. To take payment later, return a different `OrderService`
 * here (for example one that creates a payment-gateway checkout and sends the WhatsApp message after it is paid); the cart, the /order page and the
 * admin do not change.
 */
export function orderService(
  env: { DB: D1Database; ORDER_WHATSAPP?: string; SITE_WHATSAPP?: string },
  siteName: string,
): OrderService {
  return whatsappOrderService({
    db: env.DB,
    adminNumber: orderWhatsapp(env),
    siteName,
  });
}

export * from './types';
