"use client";

import { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/**
 * Renders children inside a minimalist iPhone-style device frame.
 * The content area scrolls independently — the frame stays fixed.
 * Width simulates mobile viewport (~375px).
 */
export default function IPhoneFrame({ children }: Props) {
  return (
    <div className="relative mx-auto select-none" style={{ width: "393px" }}>
      {/* Outer shell */}
      <div
        className="relative bg-gray-900 shadow-2xl"
        style={{
          borderRadius: "52px",
          padding: "12px",
        }}
      >
        {/* Side buttons — left */}
        <div
          className="absolute bg-gray-700"
          style={{
            left: "-3px",
            top: "100px",
            width: "3px",
            height: "32px",
            borderRadius: "2px 0 0 2px",
          }}
        />
        <div
          className="absolute bg-gray-700"
          style={{
            left: "-3px",
            top: "148px",
            width: "3px",
            height: "64px",
            borderRadius: "2px 0 0 2px",
          }}
        />
        <div
          className="absolute bg-gray-700"
          style={{
            left: "-3px",
            top: "224px",
            width: "3px",
            height: "64px",
            borderRadius: "2px 0 0 2px",
          }}
        />
        {/* Side button — right (power) */}
        <div
          className="absolute bg-gray-700"
          style={{
            right: "-3px",
            top: "160px",
            width: "3px",
            height: "80px",
            borderRadius: "0 2px 2px 0",
          }}
        />

        {/* Screen bezel */}
        <div
          className="bg-black overflow-hidden"
          style={{ borderRadius: "44px" }}
        >
          {/* Dynamic Island */}
          <div
            className="relative bg-black flex items-center justify-center"
            style={{ height: "52px" }}
          >
            <div
              className="bg-gray-950"
              style={{
                width: "120px",
                height: "34px",
                borderRadius: "20px",
              }}
            />
          </div>

          {/* Screen content — independently scrollable */}
          <div
            className="bg-white overflow-y-auto overflow-x-hidden"
            style={{
              width: "369px",
              height: "600px",
              scrollbarWidth: "none",
            }}
          >
            {children}
          </div>

          {/* Home indicator */}
          <div
            className="bg-black flex items-center justify-center"
            style={{ height: "28px" }}
          >
            <div
              className="bg-gray-700"
              style={{ width: "120px", height: "4px", borderRadius: "2px" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
