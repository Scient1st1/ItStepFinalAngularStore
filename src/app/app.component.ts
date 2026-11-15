import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LanternComponent } from './lantern/lantern.component';
import { HeaderComponent } from './layout/header/header.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LanternComponent, HeaderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {}
