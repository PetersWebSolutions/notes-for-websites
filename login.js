"use strict";
(function () {
  if (Store.session()) { window.location.replace("lists.html"); return; }
  const nameInput = document.getElementById("login-name");
  const passInput = document.getElementById("login-pass");
  const loginError = document.getElementById("login-error");
  const newName = document.getElementById("new-name");
  const newPass = document.getElementById("new-pass");
  const signupError = document.getElementById("signup-error");
  const live = document.getElementById("live");

  function setError(el, msg) { el.textContent = msg; el.hidden = !msg; }
  function announce(msg) {
    live.textContent = "";
    window.setTimeout(() => { live.textContent = msg; }, 30);
  }
  function enter(user, error) {
    if (!Store.signIn(user)) {
      setError(error, "Could not keep you signed in. Allow browser storage and try again.");
      announce("Could not save your sign-in.");
      return;
    }
    window.location.replace("lists.html");
  }

  document.getElementById("login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const user = Store.checkLogin(nameInput.value, passInput.value);
    if (!user) {
      setError(loginError, "That name and passcode do not match. Check the spelling and try again.");
      passInput.select();
      announce("Sign in failed.");
      return;
    }
    setError(loginError, "");
    enter(user, loginError);
  });

  document.getElementById("signup-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const result = Store.addUser(newName.value, newPass.value);
    if (!result.ok) { setError(signupError, result.error); announce(result.error); return; }
    setError(signupError, "");
    const name = newName.value.trim().replace(/\s+/g, " ").slice(0, 40);
    enter(Store.checkLogin(name, newPass.value), signupError);
  });
  [nameInput, passInput].forEach((input) => input.addEventListener("input", () => setError(loginError, "")));
  [newName, newPass].forEach((input) => input.addEventListener("input", () => setError(signupError, "")));
  nameInput.focus();
})();
