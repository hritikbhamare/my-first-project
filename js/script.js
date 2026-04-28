document.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector(".site-header");
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelectorAll(".nav-links a");
  const currentPage = getCurrentPage();

  navLinks.forEach((link) => {
    if (link.dataset.page === currentPage) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }

    link.addEventListener("click", () => {
      header?.classList.remove("menu-open");
      navToggle?.setAttribute("aria-expanded", "false");
    });
  });

  navToggle?.addEventListener("click", () => {
    const isOpen = header.classList.toggle("menu-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (event) => {
      const targetId = anchor.getAttribute("href");

      if (!targetId || targetId === "#") {
        return;
      }

      const target = document.querySelector(targetId);

      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  setupContactForm();
});

function getCurrentPage() {
  const fileName = window.location.pathname.split("/").pop() || "index.html";

  if (fileName.includes("about")) {
    return "about";
  }

  if (fileName.includes("contact")) {
    return "contact";
  }

  return "index";
}

function setupContactForm() {
  const form = document.querySelector("#contactForm");
  const status = document.querySelector("#formStatus");

  if (!form) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const fields = {
      name: form.elements.name,
      email: form.elements.email,
      subject: form.elements.subject,
      message: form.elements.message,
    };

    let isValid = true;

    Object.values(fields).forEach((field) => {
      if (!validateField(field)) {
        isValid = false;
      }
    });

    if (!isValid) {
      if (status) {
        status.textContent = "Please fix the highlighted fields.";
      }
      return;
    }

    form.reset();

    if (status) {
      status.textContent = "Thanks. Please email Hritik directly at bhamare2001@gmail.com for the fastest response.";
    }
  });

  Array.from(form.elements).forEach((field) => {
    if (field.matches("input, textarea")) {
      field.addEventListener("blur", () => validateField(field));
      field.addEventListener("input", () => clearFieldError(field));
    }
  });
}

function validateField(field) {
  const value = field.value.trim();
  const row = field.closest(".form-row");
  const error = row?.querySelector(".error-message");
  let message = "";

  if (!value) {
    message = "This field is required.";
  } else if (field.type === "email" && !isValidEmail(value)) {
    message = "Enter a valid email address.";
  } else if (field.name === "message" && value.length < 10) {
    message = "Message must be at least 10 characters.";
  }

  if (message) {
    row?.classList.add("error");
    if (error) {
      error.textContent = message;
    }
    return false;
  }

  clearFieldError(field);
  return true;
}

function clearFieldError(field) {
  const row = field.closest(".form-row");
  const error = row?.querySelector(".error-message");

  row?.classList.remove("error");

  if (error) {
    error.textContent = "";
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
