import { useRef, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import logoIcon from "../assets/Quilliant Logo Icon.png";
import "../App.css";

function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signInWithGoogle, logout } = useAuth();
  const personalizeButtonRef = useRef(null);
  const writeButtonRef = useRef(null);
  const previewButtonRef = useRef(null);
  const sliderRef = useRef(null);
  const [sliderStyle, setSliderStyle] = useState({});

  const getCurrentPage = () => {
    if (location.pathname.startsWith("/write")) return "write";
    if (location.pathname.startsWith("/preview")) return "preview";
    return "personalize";
  };

  const currentPage = getCurrentPage();

  const handleAuthClick = async () => {
    if (user) {
      await logout();
    } else {
      try {
        await signInWithGoogle();
      } catch (error) {
        console.error("Failed to sign in:", error);
      }
    }
  };

  useEffect(() => {
    const updateSliderPosition = () => {
      let activeButton = null;
      if (currentPage === "personalize") {
        activeButton = personalizeButtonRef.current;
      } else if (currentPage === "write") {
        activeButton = writeButtonRef.current;
      } else if (currentPage === "preview") {
        activeButton = previewButtonRef.current;
      }

      if (activeButton && sliderRef.current) {
        const buttonRect = activeButton.getBoundingClientRect();
        const containerRect = activeButton.parentElement.getBoundingClientRect();
        
        const width = buttonRect.width;
        const height = buttonRect.height;
        const left = buttonRect.left - containerRect.left;
        const top = buttonRect.top - containerRect.top;

        setSliderStyle({
          width: `${width}px`,
          height: `${height}px`,
          left: `${left}px`,
          top: `${top}px`,
        });
      }
    };

    // Small delay to ensure buttons are rendered
    const timeoutId = setTimeout(updateSliderPosition, 0);
    
    // Also update on window resize
    window.addEventListener("resize", updateSliderPosition);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", updateSliderPosition);
    };
  }, [currentPage]);

  return (
    <header className="header">
      <div className="logo-container">
        <img src={logoIcon} alt="Quilliant" className="logo-icon" />
        <span className="logo-text">Quilliant</span>
      </div>

      <div className="nav-buttons">
        <div ref={sliderRef} className="nav-slider" style={sliderStyle}></div>
        <button
          ref={personalizeButtonRef}
          className={`nav-button ${currentPage === "personalize" ? "active" : ""}`}
          onClick={() => navigate("/personalize")}
        >
          <i className="far fa-user"></i>
          <span>Personalize</span>
        </button>
        <button
          ref={writeButtonRef}
          className={`nav-button ${currentPage === "write" ? "active" : ""}`}
          onClick={() => navigate("/write")}
        >
          <i className="far fa-pen-to-square"></i>
          <span>Write</span>
        </button>
        <button
          ref={previewButtonRef}
          className={`nav-button ${currentPage === "preview" ? "active" : ""}`}
          onClick={() => navigate("/preview")}
        >
          <i className="far fa-eye"></i>
          <span>Preview</span>
        </button>
      </div>

      {user ? (
        <div className="user-avatar" onClick={handleAuthClick}>
          <img
            src={user.photoURL || ""}
            alt={user.displayName || "User"}
            className="user-avatar-image"
          />
        </div>
      ) : (
        <button className="login-button" onClick={handleAuthClick}>
          Log In
        </button>
      )}
    </header>
  );
}

export default Header;

