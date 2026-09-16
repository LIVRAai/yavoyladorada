(() => {
  const db = window.yavoyDb;
  const container = document.getElementById("pendingPayments");
  const refreshOrders = document.getElementById("refreshOrders");
  if (!db || !container) return;

  const BUCKET = "local2-payment-proofs";
  const paymentLabels = { nequi: "Nequi", breb: "Bre-B", daviplata: "DaviPlata", bank_transfer: "Transferencia", cash: "Efectivo", other: "Otro" };

  function money(value) {
    return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function date(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
  }

  async function currentBusiness() {
    const { data: auth } = await db.auth.getUser();
    const user = auth?.user;
    if (!user) return null;
    const { data, error } = await db.from("businesses").select("id,name").eq("owner_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function openProof(payment) {
    if (!payment.proof_path) return;
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(payment.proof_path, 120);
    if (error || !(data?.signedUrl || data?.signedURL)) {
      window.alert("No pudimos abrir el comprobante. Intenta nuevamente.");
      return;
    }
    window.open(data.signedUrl || data.signedURL, "_blank", "noopener,noreferrer");
  }

  async function refreshEverything() {
    if (refreshOrders) refreshOrders.click();
    window.setTimeout(() => renderReviewQueue().catch(console.error), 450);
  }

  async function renderReviewQueue() {
    const business = await currentBusiness();
    if (!business) return;

    const [paymentsResult, ordersResult, customersResult] = await Promise.all([
      db.from("local2_payments").select("id,order_id,status,amount_cop,payer_name,reported_at,method_type,proof_path,proof_file_name,proof_mime_type,proof_size_bytes").eq("business_id", business.id).eq("status", "reported").order("reported_at", { ascending: false }),
      db.from("local2_orders").select("id,public_code,customer_id,status,total_cop").eq("business_id", business.id),
      db.from("local2_customers").select("id,name").eq("business_id", business.id),
    ]);
    if (paymentsResult.error) throw paymentsResult.error;
    if (ordersResult.error) throw ordersResult.error;
    if (customersResult.error) throw customersResult.error;

    const payments = paymentsResult.data || [];
    const orders = new Map((ordersResult.data || []).map((item) => [item.id, item]));
    const customers = new Map((customersResult.data || []).map((item) => [item.id, item]));

    container.innerHTML = "";
    if (!payments.length) {
      container.innerHTML = '<div class="empty">No tienes comprobantes esperando revisión.</div>';
      return;
    }

    payments.forEach((payment) => {
      const order = orders.get(payment.order_id);
      const customer = order ? customers.get(order.customer_id) : null;
      const item = document.createElement("div");
      item.className = "attention-item";

      const title = document.createElement("strong");
      title.textContent = `${customer?.name || "Cliente"} · ${money(payment.amount_cop)}`;

      const meta = document.createElement("div");
      meta.className = "item-meta";
      meta.textContent = `${order?.public_code || "Pedido"} · ${paymentLabels[payment.method_type] || payment.method_type || "Medio no indicado"} · ${date(payment.reported_at)}`;

      const proof = document.createElement("div");
      proof.className = "proof-review-note";
      if (payment.proof_path) {
        proof.textContent = `Comprobante recibido${payment.proof_file_name ? ` · ${payment.proof_file_name}` : ""}`;
      } else {
        proof.className = "proof-missing";
        proof.textContent = "Registro demo anterior · sin archivo de comprobante";
      }

      const actions = document.createElement("div");
      actions.className = "item-actions";

      if (payment.proof_path) {
        const view = document.createElement("button");
        view.type = "button";
        view.className = "secondary";
        view.textContent = "Ver comprobante";
        view.addEventListener("click", () => openProof(payment));
        actions.appendChild(view);
      }

      const confirm = document.createElement("button");
      confirm.type = "button";
      confirm.className = "confirm";
      confirm.textContent = "Confirmar pago";
      confirm.addEventListener("click", async () => {
        confirm.disabled = true;
        const { error } = await db.rpc("local2_confirm_payment", { p_payment_id: payment.id });
        if (error) {
          confirm.disabled = false;
          window.alert("No pudimos confirmar el pago.");
          return;
        }
        await refreshEverything();
      });

      const reject = document.createElement("button");
      reject.type = "button";
      reject.className = "secondary";
      reject.textContent = "No confirmar";
      reject.addEventListener("click", async () => {
        if (!window.confirm(`¿Marcar el pago de ${order?.public_code || "este pedido"} como no confirmado? El cliente podrá enviar un nuevo comprobante.`)) return;
        reject.disabled = true;
        const { error } = await db.rpc("local2_reject_payment", { p_payment_id: payment.id });
        if (error) {
          reject.disabled = false;
          window.alert("No pudimos rechazar el comprobante.");
          return;
        }
        await refreshEverything();
      });

      actions.append(confirm, reject);
      item.append(title, meta, proof, actions);
      container.appendChild(item);
    });
  }

  const observer = new MutationObserver(() => {
    if (!document.getElementById("ownerApp")?.hidden && !container.dataset.proofReviewStarted) {
      container.dataset.proofReviewStarted = "1";
      window.setTimeout(() => renderReviewQueue().catch(console.error), 120);
    }
  });
  observer.observe(document.getElementById("ownerApp") || document.body, { attributes: true, childList: false, subtree: false });

  refreshOrders?.addEventListener("click", () => {
    window.setTimeout(() => renderReviewQueue().catch(console.error), 350);
  });

  window.setTimeout(() => renderReviewQueue().catch(() => {}), 900);
})();
