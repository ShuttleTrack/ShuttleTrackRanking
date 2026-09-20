import Link from 'next/link';
import Image from 'next/image';
import { BUILD_IDENTIFIER } from './navUtils';

export function NavLogo() {
  return (
    <Link href="/" className="flex-shrink-0 h-full inline-flex items-stretch self-stretch">
      <Image
        src={`/dutch-lankan-shuttle-masters-logo.jpeg?v=${BUILD_IDENTIFIER}`}
        alt="Dutch Lankan Shuttle Masters"
        width={64}
        height={64}
        className="h-full w-auto object-contain object-center"
        priority
      />
      <span className="sr-only">Dutch Lankan Shuttle Masters</span>
    </Link>
  );
}
