(() => {
  const client = window.yavoyDb;
  if (!client?.functions?.invoke) return;

  const originalInvoke = client.functions.invoke.bind(client.functions);
  client.functions.invoke = (functionName, options = {}) => {
    const action = options?.body?.action;
    if (functionName === "local2-public-api" && action === "send_message") {
      return originalInvoke("local2-chat-api-v2", options);
    }
    return originalInvoke(functionName, options);
  };

  const handoff = document.createElement("script");
  handoff.src = "local2-handoff.js";
  handoff.defer = true;
  document.head.appendChild(handoff);
})();
