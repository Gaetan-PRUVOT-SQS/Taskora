import { Component } from "react";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="page flex min-h-screen items-center justify-center bg-white p-6">
          <div className="auth-box flex w-full max-w-[520px] flex-col gap-3.5 rounded-3xl border border-[#eeeeee] bg-white px-7 py-8 shadow-lg">
            <h1 className="text-center text-xl font-semibold text-black">
              {"L'écran a planté"}
            </h1>
            <p className="error" role="alert">
              Recharge la page pour reprendre le tableau.
            </p>
            <button
              type="button"
              className="btn primary"
              onClick={function () {
                window.location.reload();
              }}
            >
              Recharger
            </button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
