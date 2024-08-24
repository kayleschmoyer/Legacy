import * as React from 'react';
import { Slot } from 'expo-router';
import { Header } from '../common/Header';
import { Footer } from '../common/Footer';

export default function Layout() {
  return (
    <React.Fragment>
      <Header></Header>
      <Slot />
      <Footer></Footer>
    </React.Fragment>
  );
}
