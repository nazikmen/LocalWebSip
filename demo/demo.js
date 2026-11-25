"use strict";
const output = document.getElementById("output");
function show(label, value) {
  output.textContent = label + ": " + JSON.stringify(value, null, 2) + "\n" + output.textContent;
}
try {
  const sip = new LocalWebSip();
  sip.subscribe((event) => show("Event", event));
  const actions = {
    info: () => sip.getInfo(),
    configure: () => sip.configureAccount("demo-fake-account", "Demo"),
    register: () => sip.register(),
    dial: () => sip.dial(document.getElementById("number").value),
    hangup: () => sip.hangup(),
    status: () => sip.getStatus()
  };
  for (const [id, action] of Object.entries(actions)) {
    document.getElementById(id).addEventListener("click", async () => {
      try { show(id, await action()); }
      catch (error) { show("Error", { code: error.code, message: error.message }); }
    });
  }
} catch (error) {
  show("Error", { code: error.code, message: error.message });
}
