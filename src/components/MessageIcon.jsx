const MessageIcon = ({ size = 24, color = "#25D366" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M21 12c0 4.418-4.03 8-9 8-1.09 0-2.14-.15-3.11-.44L3 21l1.58-3.77C3.59 15.98 3 14.05 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z"
      stroke={color}
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

export default MessageIcon;
