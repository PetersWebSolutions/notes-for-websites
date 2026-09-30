"use strict";
(function () {
  // After sign-in everyone lands on the lists page and picks a list there.
  const HOME = "lists.html";
  if (Store.session()) { window.location.replace(HOME); return; }
  const nameInput = document.getElementById("login-name");
  const passInput = document.getElementById("login-pass");
  const loginError = document.getElementById("login-error");
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
    window.location.replace(HOME);
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

  [nameInput, passInput].forEach((input) => input.addEventListener("input", () => setError(loginError, "")));
  nameInput.focus();
})();
