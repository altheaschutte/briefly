type Props = {
  children: React.ReactNode;
  className?: string;
};

export function Container({ children, className = "" }: Props) {
  return <div className={`mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8 ${className}`}>{children}</div>;
}
